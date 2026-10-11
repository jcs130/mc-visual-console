import json
import tempfile
import time
import unittest
from pathlib import Path

from metrics import config_metadata, normalize_metadata, normalize_model_health, normalize_strata, normalize_tts, stale_model

SPEC = {"id": "main", "label": "主模型"}
LAST = {"prompt_total": 8000, "prompt_tokens": 8000, "reused": 6000,
        "output_tokens": 500, "prompt_ms": 1000, "decode_ms": 5000, "decode_tok_s": 100}


class MetricsTest(unittest.TestCase):
    def native(self, live, last=LAST):
        return normalize_strata({"engine": {"model": "test-Q4_K_M", "max_context": 10000},
                                 "live": live, "requests": [last], "time": time.time()}, SPEC)

    def test_whole_input_not_progress_or_output(self):
        m = self.native({"state": "reading", "prompt_tokens": 8000, "prompt_total": 8200,
                         "prompt_read": 100, "generated": 200, "phase": "reading the prompt", "elapsed_s": 2})
        self.assertEqual(m["contextTokens"], 8000)
        self.assertEqual(m["contextPercent"], 80)
        self.assertEqual(m["executionSeconds"], 2)

    def test_new_request_does_not_borrow_previous(self):
        m = self.native({"state": "generating", "prompt_read": 100, "prompt_total": 8000, "prefill_tok_s_mean": 123})
        for key in ("contextTokens", "contextPercent", "executionSeconds", "inputTps", "outputTps", "queue"):
            self.assertIsNone(m[key], key)
        self.assertEqual(m["prefixReuseRatio"], .75)  # deliberately labelled 上轮

    def test_idle_reports_last_engine_times(self):
        m = self.native({"state": "idle", "queued": 0})
        self.assertEqual(m["queue"], 0)
        self.assertEqual(m["inputTps"], 2000)
        self.assertEqual(m["outputTps"], 100)
        self.assertEqual(m["executionSeconds"], 6)
        self.assertEqual(m["contextKind"], "last")

    def test_cancelled_partial_read_keeps_whole_input(self):
        m = self.native({"state": "idle"}, LAST | {"prompt_tokens": 6500, "prompt_read": 500})
        self.assertEqual(m["contextTokens"], 8000)
        self.assertEqual(m["inputTps"], 500)

    def test_no_history_no_fake_zero(self):
        m = self.native({"state": "idle"}, {})
        for key in ("contextTokens", "inputTps", "outputTps", "executionSeconds", "prefixReuseRatio"):
            self.assertIsNone(m[key])

    def test_parallel_never_mixes_requests(self):
        m = self.native({"state": "generating", "parallel": 2, "running": 2, "queued": 1,
                         "waiting": 2, "prompt_tokens": 10, "tok_s": 50, "elapsed_s": 2})
        self.assertEqual(m["queue"], 3)
        self.assertIsNone(m["contextTokens"])
        self.assertIsNone(m["outputTps"])
        self.assertIsNone(m["executionSeconds"])
        m = self.native({"state": "reading", "parallel": 2, "running": 1, "queued": 0,
                         "phase": "reading the prompt", "elapsed_s": 20})
        self.assertIsNone(m["executionSeconds"])
        self.assertIsNone(m["queue"])

    def test_non_inference_phase_not_execution(self):
        m = self.native({"state": "reading", "phase": "restoring a session", "elapsed_s": 90})
        self.assertIsNone(m["executionSeconds"])

    def test_health_not_idle(self):
        m = normalize_model_health({"status": "ok", "model": "StartLux-Decision-4B"}, SPEC)
        self.assertEqual(m["state"], "unknown")
        self.assertIsNone(m["queue"])
        self.assertIsNone(m["executionSeconds"])

    def test_expiration_removes_runtime_data(self):
        m = self.native({"state": "generating", "prompt_tokens": 8000, "tok_s": 80})
        expired = stale_model(m, m["sampledAt"] + 8)
        self.assertEqual(expired["state"], "disconnected")
        for key in ("contextTokens", "contextLimit", "inputTps", "outputTps", "queue", "prefixReuseRatio"):
            self.assertIsNone(expired[key])

    def test_dynamic_config_limit_and_quant(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "engine.json"
            p.write_text(json.dumps({"args": ["--ctx", "32768"], "model": "weights/Qwen-Q5_K_M.gguf"}))
            self.assertEqual(config_metadata(p), {"contextLimit": 32768, "quant": "Q5_K_M"})
            p.write_text(json.dumps({"args": ["--ctx", "131072"]}))
            meta = config_metadata(p)
            m = normalize_strata({"engine": {}, "live": {"state": "reading", "prompt_tokens": 100000}}, SPEC, metadata=meta)
            self.assertEqual(m["contextLimit"], 131072)

    def test_explicit_contract_requires_current_request(self):
        raw = {"schema": "obs-inference-v1", "engine": {"model": "decision", "max_context": 4096},
               "live": {"state": "reading", "context_tokens": 100, "execution_seconds": 1},
               "last": {"context_tokens": 2000, "execution_seconds": 3, "reused_tokens": 0}}
        self.assertIsNone(normalize_metadata(raw, SPEC)["contextTokens"])
        raw["live"]["request_id"] = "request-2"
        self.assertEqual(normalize_metadata(raw, SPEC)["contextTokens"], 100)

    def test_tts_explicit_counts_only(self):
        for raw in ({}, {"requests_served": 100, "queue_ms": 20, "playing": 1}):
            m = normalize_tts(raw)
            self.assertIsNone(m["synthesizing"])
            self.assertIsNone(m["lastSynthesisSeconds"])
        m = normalize_tts({"status": "ok", "synthesizing": 1, "waiting": 0, "pending_items": 2,
                           "last_synthesis_seconds": .8})
        self.assertEqual(m["waiting"], 0)
        self.assertEqual(m["lastSynthesisSeconds"], .8)

    def test_rates_can_be_computed_from_current_metadata(self):
        m = normalize_metadata({"schema": "obs-inference-v1", "engine": {},
                                "live": {"state": "generating", "request_id": "current", "input_processed_tokens": 1000,
                                         "input_processing_seconds": .5, "output_tokens": 100, "decode_seconds": 2}}, SPEC)
        self.assertEqual(m["inputTps"], 2000)
        self.assertEqual(m["outputTps"], 50)

    def test_sensitive_and_invalid_values_are_not_returned(self):
        raw = {"engine": {"model": "ok", "max_context": float("nan"), "api_key": "sensitive-fixture"},
               "live": {"state": "generating", "queued": True, "prompt_tokens": -1, "tok_s": float("inf"),
                        "prompt": "sensitive-fixture", "reasoning": "sensitive-fixture"}}
        m = normalize_strata(raw, SPEC)
        self.assertNotIn("sensitive-fixture", json.dumps(m))
        for key in ("contextLimit", "contextTokens", "queue", "outputTps"):
            self.assertIsNone(m[key])


if __name__ == "__main__":
    unittest.main()
