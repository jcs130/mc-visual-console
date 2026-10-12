import copy
import time
import unittest

from metrics import normalize_metadata, normalize_reasoning, stale_model
from brain import normalize_selection

SPEC = {"id": "main", "label": "主模型"}


def reasoning():
    return {"requested": {"thinking": True, "reasoning_effort": "high", "budget_tokens": 4096},
            "effective": {"thinking": True, "reasoning_effort": "medium", "native_reasoning_effort": "medium", "budget_tokens": 1024, "budget_status": "applied"},
            "confirmation": "serving_template_and_budget_policy"}


def sample():
    return {"schema": "obs-inference-v1", "time": time.time(), "engine": {"model": "fixture", "max_context": 65536},
            "live": {"state": "generating", "running": 1, "queued": 2, "request_id": None, "context_tokens": None, "execution_seconds": None},
            "last": {"context_tokens": 900, "execution_seconds": 90, "queue_ms": 200, "reasoning": reasoning(), "reasoning_tokens": 15},
            "active_requests": [{"request_id": "call-1", "session_id": "session", "attempt_id": "attempt-1", "state": "generating",
                                 "context_tokens": 1200, "execution_ms": 1500, "queue_ms": 30, "input_tok_s": 400,
                                 "decode_tok_s": 20, "reasoning": reasoning(), "sample_age_ms": 10}]}


class EngineMetadataTest(unittest.TestCase):
    def test_single_active_request_uses_its_complete_metadata(self):
        value = normalize_metadata(sample(), SPEC)
        self.assertEqual(value["requestId"], "call-1")
        self.assertEqual(value["executionSeconds"], 1.5)
        self.assertEqual(value["queueSeconds"], .03)
        self.assertEqual(value["contextTokens"], 1200)
        self.assertEqual(value["outputTps"], 20)
        self.assertEqual(value["reasoning"]["effective"]["budgetTokens"], 1024)
        self.assertIsNone(value["reasoningTokens"])

    def test_parallel_rows_are_separate_and_do_not_populate_a_mixed_summary(self):
        raw = sample()
        raw["live"]["running"] = 2
        second = copy.deepcopy(raw["active_requests"][0])
        second.update(request_id="call-2", context_tokens=2400, execution_ms=3000, input_tok_s=None)
        raw["active_requests"].append(second)
        value = normalize_metadata(raw, SPEC)
        self.assertEqual(value["reason"], "multiple-active-requests")
        self.assertIsNone(value["contextTokens"])
        self.assertIsNone(value["executionSeconds"])
        self.assertIsNone(value["reasoning"])
        self.assertEqual([(r["requestId"], r["contextTokens"], r["executionSeconds"]) for r in value["activeRequests"]],
                         [("call-1", 1200, 1.5), ("call-2", 2400, 3)])
        self.assertIsNone(value["activeRequests"][1]["inputTps"])

    def test_missing_stale_and_mismatched_current_fields_do_not_borrow_last(self):
        raw = sample()
        raw["active_requests"][0].update(context_tokens=None, execution_seconds=None, sample_age_ms=9000)
        value = normalize_metadata(raw, SPEC)
        self.assertIsNone(value["contextTokens"])
        self.assertIsNone(value["executionSeconds"])
        self.assertIsNone(value["reasoning"])
        raw["active_requests"][0]["sample_age_ms"] = 0
        raw["live"]["request_id"] = "different-call"
        self.assertIsNone(normalize_metadata(raw, SPEC)["contextTokens"])
        raw["gateway_snapshot_age_ms"] = 9000
        self.assertEqual(normalize_metadata(raw, SPEC)["reason"], "stale")
        value = normalize_metadata(sample(), SPEC, sampled_at=100)
        self.assertEqual(stale_model(value, 110)["activeRequests"], [])

    def test_idle_explicit_null_timing_is_not_derived_from_segments(self):
        raw = sample()
        raw["live"].update(state="idle", running=0)
        raw["active_requests"] = []
        raw["last"].update(execution_seconds=None, execution_ms=1000, prompt_ms=400, decode_ms=600)
        value = normalize_metadata(raw, SPEC)
        self.assertIsNone(value["executionSeconds"])
        self.assertEqual(value["queueSeconds"], .2)
        self.assertEqual(value["reasoning"]["requested"]["effort"], "high")

    def test_confirmation_and_independent_budgets_are_not_inferred(self):
        self.assertIsNone(normalize_reasoning({"requested": reasoning()["requested"]})["confirmed"])
        raw = reasoning()
        raw["effective"].update(thinking=False, budget_status="disabled", budget_tokens=4096)
        self.assertIsNone(normalize_reasoning(raw)["effective"]["budgetTokens"])
        self.assertIsNone(normalize_reasoning({"effective": {"reasoning_effort": {"secret": "value"}}})["effective"]["effort"])

    def test_framework_receipt_requires_same_request_and_confirmation(self):
        raw = {"scope": "last", "decision_id": "decision", "request_id": "call-1", "inference_request_id": "call-1",
               "applied": {"thinking": True, "effort": "high"}, "provider_confirmed": True,
               "provider_effective": {"thinking": True, "effort": "medium", "budgetTokens": 1024},
               "queue_ms": 30, "execution_ms": 1500}
        value = normalize_selection(raw)
        self.assertEqual(value["effort"], "high")
        self.assertEqual(value["effectiveEffort"], "medium")
        self.assertEqual(value["effectiveReasoningBudgetTokens"], 1024)
        raw["inference_request_id"] = "other-call"
        value = normalize_selection(raw)
        self.assertIsNone(value["effectiveEffort"])
        self.assertIsNone(value["providerConfirmed"])
        self.assertIsNone(value["executionSeconds"])


if __name__ == "__main__":
    unittest.main()
