import unittest
from harness import normalize_harness, stale_harness


class HarnessTest(unittest.TestCase):
    def test_source_and_coverage_survive_but_payloads_and_claimed_improvement_do_not(self):
        payload = {"schema": "agent-harness-metrics-v1", "time": 1000, "run": "test",
                   "window": {"seconds": 600, "coveredSeconds": 3, "complete": False},
                   "tools": {"source": "runtime-measured", "calls": 2, "returned": 1, "errors": 0},
                   "models": [{"source": "host-reported", "role": "system2", "completed": 1, "prompt": "private",
                               "elapsedMs": {"samples": 1, "p50": 8500, "p95": 8500},
                               "inputTokens": {"samples": 1, "total": 20000}}],
                   "learning": {"source": "host-reported", "reportedEvents": 1, "environmentVerifiedImprovement": True,
                                "latest": [{"method": "rail", "author": "other-agent", "stage": "evaluated", "outcome": "success", "text": "private"}]}}
        value = normalize_harness(payload, 1000)
        self.assertEqual(value["models"][0]["elapsedMs"]["p50"], 8500)
        self.assertIsNone(value["models"][0]["outputTokens"]["total"])
        self.assertIsNone(value["learning"]["environmentVerifiedImprovement"])
        self.assertNotIn("private", str(value))
        self.assertEqual(value["window"]["coveredSeconds"], 3)
        self.assertIsNone(stale_harness(value, 1008)["tools"])

    def test_invalid_schema_and_old_source_do_not_become_live_measurements(self):
        self.assertIsNone(normalize_harness({"schema": "other", "time": 1000})["tools"])
        value = normalize_harness({"schema": "agent-harness-metrics-v1", "time": 1000,
                                   "window": {"seconds": 600}}, 2000)
        self.assertEqual(stale_harness(value, 2000)["source"], "stale")
