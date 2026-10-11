import json
import tempfile
import time
import unittest
from pathlib import Path

from brain import configuration, normalize_brain, normalize_selection, normalize_statistics, normalize_status, stale_brain


def window(**extra):
    now = time.time()
    return {"window_seconds": 600, "from": now - 600, "to": now, "covered_seconds": 600,
            "complete": True, "eligible_requests": 20, "adaptive_applied": 12,
            "selector_attempts": 10, "selector_timeouts": 1, "selector_unavailable": 0,
            "selector_uncertain": 1, "selector_stale": 0, "calls": 22, "failed_calls": 2,
            "retries": 2, "verified_success": 8, "verified_failed": 2, "unknown_tasks": 3,
            "recovery_cases": 4, "recovered": 2, **extra}


class BrainTest(unittest.TestCase):
    def test_static_policy_does_not_become_current_choice(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "config.json"
            path.write_text(json.dumps({"foreground": {"enabled": True, "maxHistoryTokens": 8000},
                                        "fastForeground": {"enabled": True, "focusedHistoryTokens": 3000},
                                        "apiKey": "sensitive-fixture", "prompt": "sensitive-fixture"}))
            cfg = configuration(path)
            b = normalize_status({"loop": {"phase": {"state": "idle"}}}, cfg)
            self.assertTrue(cfg["automaticReading"])
            self.assertIsNone(cfg["automaticReasoning"])
            self.assertIsNone(b["selection"])
            self.assertIsNone(b["statistics"])
            self.assertNotIn("sensitive-fixture", json.dumps(b))

    def test_status_estimate_not_actual_input(self):
        b = normalize_status({"loop": {"phase": {"state": "model"}, "estTokens": 99999},
                              "modelConnection": {"name": "local", "model": "test", "baseUrl": "sensitive-fixture"}})
        self.assertEqual(b["phase"], "model")
        self.assertNotIn("99999", json.dumps(b))
        self.assertNotIn("sensitive-fixture", json.dumps(b))

    def test_requested_and_applied_history_remain_distinct(self):
        s = normalize_selection({"scope": "current", "decision_id": "d2", "origin": "mixed",
                                 "sources": {"route": "configured", "reading": "adaptive", "reasoning": "inherited"},
                                 "applied": {"role": "main", "reading": "focused"},
                                 "context": {"requested_history_tokens": 3000, "applied_history_tokens": 8000}})
        self.assertEqual(s["requestedHistoryTokens"], 3000)
        self.assertEqual(s["historyTokens"], 8000)
        self.assertEqual(s["readingOrigin"], "adaptive")
        self.assertEqual(s["reasoningOrigin"], "inherited")
        self.assertIsNone(s["thinking"])

    def test_actual_input_requires_same_inference(self):
        raw = {"scope": "current", "decision_id": "d2", "request_id": "r2", "inference_request_id": "r1",
               "context": {"actual_input_tokens": 8000, "estimated_input_tokens": 9000}}
        self.assertIsNone(normalize_selection(raw)["actualInputTokens"])
        raw["inference_request_id"] = "r2"
        self.assertEqual(normalize_selection(raw)["actualInputTokens"], 8000)

    def test_window_rates_have_separate_denominators(self):
        w = normalize_statistics(window())
        self.assertEqual(w["adaptiveRate"], .6)
        self.assertEqual(w["fallbackRate"], .2)
        self.assertEqual(w["taskSuccessRate"], .8)
        self.assertEqual(w["recoveryRate"], .5)
        self.assertEqual(w["verifiedTotal"], 10)  # unknown tasks are not verified failures

    def test_zero_samples_missing_counters_and_invalid_rates_unknown(self):
        for w in (normalize_statistics(window(eligible_requests=0, adaptive_applied=0)),
                  normalize_statistics(window(eligible_requests=1, adaptive_applied=2))):
            self.assertIsNone(w["adaptiveRate"])
        self.assertIsNone(normalize_statistics(window(selector_stale=None))["fallbackRate"])
        self.assertIsNone(normalize_statistics(window())["reasoning_tokens"])
        self.assertIsNone(normalize_statistics(window())["effortCounts"]["high"])

    def test_context_distributions_require_samples(self):
        w = normalize_statistics(window(context_distributions={
            "history_budget": {"samples": 10, "p50_tokens": 3000, "p95_tokens": 8000},
            "matched_input": {"samples": 0, "p50_tokens": 0, "p95_tokens": 0},
            "reasoning_budget": {"samples": 1, "p50_tokens": 2000, "p95_tokens": 1000}}))
        self.assertEqual(w["contextDistributions"]["history_budget"]["p50"], 3000)
        self.assertIsNone(w["contextDistributions"]["matched_input"]["p50"])
        self.assertIsNone(w["contextDistributions"]["reasoning_budget"]["p95"])

    def test_window_scope_and_staleness(self):
        self.assertIsNone(normalize_statistics(window(window_seconds=86400)))
        old = window()
        raw = {"schema": "cortico-brain-metrics-v1", "time": old["to"] + 8, "window": old}
        self.assertIsNone(normalize_brain(raw)["statistics"])
        self.assertIsNone(normalize_brain({"schema": "cortico-brain-metrics-v1"})["sampledAt"])

    def test_current_missing_never_uses_last(self):
        b = normalize_brain({"schema": "cortico-brain-metrics-v1", "time": time.time(),
                             "selection": {"scope": "current", "decision_id": "d2"},
                             "last": {"effort": "high", "context_tokens": 100000}})
        self.assertIsNone(b["selection"]["effort"])
        self.assertIsNone(b["selection"]["historyTokens"])

    def test_expiration_clears_selection_statistics_and_config(self):
        now = time.time()
        b = normalize_brain({"schema": "cortico-brain-metrics-v1", "time": now, "window": window(),
                             "selection": {"scope": "current", "decision_id": "d2"}}, sampled_at=now)
        b["configuration"] = configuration(None) | {"sampledAt": now, "focusedHistoryTokens": 3000}
        b = stale_brain(b, now + 8)
        self.assertIsNone(b["selection"])
        self.assertIsNone(b["statistics"])
        self.assertIsNone(b["configuration"]["focusedHistoryTokens"])


if __name__ == "__main__":
    unittest.main()
