import json
import tempfile
import threading
import time
import unittest
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from server import Collector, get_json, handler_for, sample_connections


class CollectorTest(unittest.TestCase):
    def test_browsers_only_read_shared_cache(self):
        hits = []

        class Upstream(BaseHTTPRequestHandler):
            def do_GET(self):
                hits.append(self.path)
                payload = {"schema": "obs-inference-v1", "time": time.time(),
                           "engine": {"model": "test", "max_context": 4096},
                           "live": {"state": "idle", "queued": 0}}
                if self.path == "/api/brain/metrics":
                    payload = {"schema": "cortico-brain-metrics-v1", "time": time.time(), "phase": "idle",
                               "selection": {"scope": "last", "decision_id": "d1", "context": {"applied_history_tokens": 3000}},
                               "prompt": "sensitive-fixture"}
                data = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_):
                pass

        upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory() as d:
            address = f"http://127.0.0.1:{upstream.server_port}/metrics"
            cfg = {"models": [{"id": name, "label": name, "metricsUrl": address} for name in ("main", "system1")],
                   "tts": {}, "connections": {}, "brain": {"metricsUrl": address.replace("/metrics", "/api/brain/metrics")}}
            path = Path(d) / "config.json"
            path.write_text(json.dumps(cfg))
            collector = Collector(path)
            collector.start()
            overlay = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(collector))
            overlay.daemon_threads = True
            threading.Thread(target=overlay.serve_forever, daemon=True).start()
            try:
                deadline = time.monotonic() + 2
                while len(hits) < 2 and time.monotonic() < deadline:
                    time.sleep(.01)
                time.sleep(.05)
                initial = len(hits)
                def read(_):
                    with urllib.request.urlopen(f"http://127.0.0.1:{overlay.server_port}/api/state", timeout=3) as r:
                        return json.load(r)
                with ThreadPoolExecutor(max_workers=8) as pool:
                    results = list(pool.map(read, range(48)))
                self.assertEqual(len(hits), initial)
                self.assertEqual(initial, 2)  # one inference URL shared by two roles, one framework URL
                self.assertEqual(len(results), 48)
                self.assertTrue(all(result["models"][0]["queue"] == 0 for result in results))
                self.assertTrue(all(result["brain"]["selection"]["historyTokens"] == 3000 for result in results))
                self.assertNotIn("sensitive-fixture", json.dumps(results))
                self.assertEqual(sorted(hits), ["/api/brain/metrics", "/metrics"])
            finally:
                collector.shutdown()
                overlay.shutdown()
                overlay.server_close()
        upstream.shutdown()
        upstream.server_close()

    def test_read_only_paths_reject_inference_credentials_and_redirect_targets(self):
        for url in ("http://127.0.0.1/v1/chat/completions", "http://secret:token@127.0.0.1/metrics",
                    "http://127.0.0.1/metrics?key=secret", "file:///metrics"):
            with self.assertRaises(ValueError):
                get_json(url, {"/metrics"})

    def test_connections_are_established_ingress_entries(self):
        output = """TCP  127.0.0.1:1234 127.0.0.1:4567 ESTABLISHED 1
TCP  127.0.0.1:4567 127.0.0.1:1234 ESTABLISHED 2
TCP  0.0.0.0:1234 0.0.0.0:0 LISTENING 1
TCP  127.0.0.1:9999 127.0.0.1:1234 TIME_WAIT 0"""
        with patch("server.subprocess.run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = output
            value = sample_connections({"NEKO": [1234], "MC": [8888], "unclassified": []})
        self.assertEqual(value["NEKO"], 1)
        self.assertEqual(value["MC"], 0)
        self.assertIsNone(value["unclassified"])


if __name__ == "__main__":
    unittest.main()
