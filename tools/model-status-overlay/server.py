"""Loopback-only OBS overlay. Browsers read a shared cache and never poll inference endpoints."""
from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from metrics import blank_model, config_metadata, normalize_model_health, normalize_metadata, normalize_tts, stale_model, count, number
from brain import blank_brain, configuration, normalize_brain, normalize_status, stale_brain
from connections import sample_model_ingress
from harness import blank_harness, normalize_harness, stale_harness

ROOT = Path(__file__).resolve().parent
MAX_JSON_BYTES = 2 * 1024 * 1024


def get_json(url, allowed_path, timeout=1.5):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("invalid-read-only-url")
    if parts.path.rstrip("/") not in allowed_path:
        raise ValueError("unsupported-read-only-path")
    # No credentials, prompt bodies, streaming responses or redirects to inference/control endpoints.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    with opener.open(request, timeout=timeout) as response:
        data = response.read(MAX_JSON_BYTES + 1)
        if len(data) > MAX_JSON_BYTES:
            raise ValueError("metrics-too-large")
        return json.loads(data)


def read_config(path):
    with Path(path).open(encoding="utf-8-sig") as stream:
        cfg = json.load(stream)
    for spec in cfg["models"]:
        for key in ("metricsUrl", "engineConfigPath"):
            env = spec.get(key + "Env")
            if env and os.environ.get(env):
                spec[key] = os.environ[env]
    if cfg.get("tts", {}).get("metricsUrlEnv"):
        cfg["tts"]["metricsUrl"] = os.environ.get(cfg["tts"]["metricsUrlEnv"], cfg["tts"].get("metricsUrl", ""))
    if cfg.get("brain", {}).get("metricsUrlEnv"):
        cfg["brain"]["metricsUrl"] = os.environ.get(cfg["brain"]["metricsUrlEnv"], cfg["brain"].get("metricsUrl", ""))
    return cfg


def sample_connections(config):
    """Established server-side TCP entries at explicitly configured ingress ports, never request counts."""
    if config.get("modelIngress"):
        return sample_model_ingress(config["modelIngress"])
    groups = {name: set(ports) for name, ports in config.items() if name in ("NEKO", "MC", "unclassified")}
    counts = {name: None if not ports else 0 for name, ports in groups.items()}
    if not any(groups.values()):
        return {"sampledAt": None, "freshForSeconds": 16, **counts}
    try:
        proc = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True,
                              timeout=3, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if proc.returncode:
            raise OSError("netstat-failed")
        for row in proc.stdout.splitlines():
            cells = row.split()
            if len(cells) < 5 or cells[0] != "TCP" or cells[3] != "ESTABLISHED":
                continue
            port = int(cells[1].rsplit(":", 1)[1])
            for group, ports in groups.items():
                if port in ports:
                    counts[group] += 1
        return {"sampledAt": time.time(), "freshForSeconds": 16, **counts}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {"sampledAt": None, "freshForSeconds": 16, **{name: None for name in groups}}


class Collector:
    def __init__(self, config_path):
        self.config_path = config_path
        self.lock = threading.Lock()
        self.stop = threading.Event()
        cfg = read_config(config_path)
        self.models = {m["id"]: blank_model(m) for m in cfg["models"]}
        self.tts = normalize_tts({}) | {"sampledAt": None, "connected": None}
        self.connections = {"sampledAt": None, "freshForSeconds": 16, "NEKO": None, "MC": None, "unclassified": None}
        self.brain = blank_brain()
        self.harness = blank_harness()
        self.counts = {"models": 0, "tts": 0, "connections": 0, "brain": 0, "harness": 0}
        self.clock_progress = {}
        self.threads = []
        self.started_at = time.time()

    def start(self):
        for kind in ("models", "tts", "connections", "brain", "harness"):
            worker = threading.Thread(target=self.loop, args=(kind,), daemon=True, name="obs-" + kind)
            worker.start()
            self.threads.append(worker)

    def shutdown(self):
        self.stop.set()
        for worker in self.threads:
            worker.join(4)

    def frozen(self, key, source_time, limit=7):
        if source_time is None:
            return False
        old_time, changed = self.clock_progress.get(key, (None, time.monotonic()))
        if source_time != old_time:
            changed = time.monotonic()
        self.clock_progress[key] = source_time, changed
        return time.monotonic() - changed > limit

    def sample_models(self, cfg):
        updates = {}
        # A URL is polled once per cycle even if two display roles intentionally use the same service.
        polled = {}
        for spec in cfg["models"]:
            metrics_url = spec.get("metricsUrl")
            health_url = spec.get("healthUrl")
            try:
                if metrics_url:
                    if metrics_url not in polled:
                        polled[metrics_url] = get_json(metrics_url, {"/metrics"})
                    value = normalize_metadata(polled[metrics_url], spec, metadata=config_metadata(spec.get("engineConfigPath")))
                    if self.frozen(metrics_url, value.get("sourceAt")):
                        value = blank_model(spec, None, "stale")
                elif health_url:
                    value = normalize_model_health(get_json(health_url, {"/health", "/v1/health"}), spec)
                else:
                    value = blank_model(spec)
            except (OSError, ValueError, TypeError, urllib.error.URLError):
                value = blank_model(spec, None, "unreachable")
                if metrics_url and health_url:
                    try:
                        value = normalize_model_health(get_json(health_url, {"/health", "/v1/health"}), spec)
                    except (OSError, ValueError, TypeError, urllib.error.URLError):
                        pass
            updates[spec["id"]] = value
        with self.lock:
            self.models = updates

    def sample_tts(self, cfg):
        spec = cfg.get("tts", {})
        try:
            url = spec.get("metricsUrl") or spec.get("healthUrl")
            if not url:
                raise ValueError("not-configured")
            metrics = bool(spec.get("metricsUrl"))
            value = normalize_tts(get_json(url, {"/metrics"} if metrics else {"/health", "/v1/health"}), health_only=not metrics)
            if self.frozen(url, value.get("sourceAt"), 16):
                value = normalize_tts({}) | {"sampledAt": None, "connected": None}
        except (OSError, ValueError, TypeError, urllib.error.URLError):
            value = normalize_tts({}) | {"sampledAt": None, "connected": None}
        value.update(pendingSampledAt=None, pendingSourceAt=None)
        if spec.get("pendingUrl"):
            value["pending"] = None
            try:
                pending = get_json(spec["pendingUrl"], {"/api/console/providers/world:vtuber/panels/tts/metrics"})
                source_at = number(pending.get("time"), positive=True)
                if pending.get("schema") == "vtuber-sender-metrics-v1" and source_at is not None \
                        and not self.frozen(spec["pendingUrl"], source_at, 16):
                    value.update(pending=count(pending.get("pending_items")), pendingSampledAt=time.time(), pendingSourceAt=source_at)
            except (OSError, ValueError, TypeError, urllib.error.URLError):
                pass
        with self.lock:
            self.tts = value

    def sample_brain(self, cfg):
        spec = cfg.get("brain", {})
        policy = configuration(spec.get("deploymentConfigPath"))
        value = blank_brain(policy)
        try:
            if spec.get("metricsUrl"):
                url = spec["metricsUrl"]
                value = normalize_brain(get_json(url, {"/metrics", "/api/brain/metrics", "/api/console/providers/persona:cortiv/panels/planning/metrics"}), policy)
                if self.frozen(url, value.get("sourceAt")):
                    value = blank_brain(policy) | {"source": "stale"}
            elif spec.get("statusUrl"):
                value = normalize_status(get_json(spec["statusUrl"], {"/api/status"}), policy)
        except (OSError, ValueError, TypeError, urllib.error.URLError):
            value["source"] = "unreachable"
            if spec.get("metricsUrl") and spec.get("statusUrl"):
                try:
                    value = normalize_status(get_json(spec["statusUrl"], {"/api/status"}), policy)
                except (OSError, ValueError, TypeError, urllib.error.URLError):
                    pass
        with self.lock:
            self.brain = value

    def sample_harness(self, cfg):
        value = blank_harness()
        url = cfg.get("harness", {}).get("metricsUrl")
        if url:
            try:
                value = normalize_harness(get_json(url, {"/api/harness/metrics"}))
                if self.frozen(url, value.get("sourceAt")):
                    value = blank_harness() | {"source": "stale"}
            except (OSError, ValueError, TypeError, urllib.error.URLError):
                value["source"] = "unreachable"
        with self.lock:
            self.harness = value

    def loop(self, kind):
        while not self.stop.is_set():
            start = time.monotonic()
            interval = 2 if kind in ("models", "brain") else 5
            try:
                cfg = read_config(self.config_path)
                if kind == "models":
                    interval = max(2, cfg.get("modelIntervalSeconds", 2))
                    self.sample_models(cfg)
                elif kind == "tts":
                    interval = max(5, cfg.get("ttsIntervalSeconds", 5))
                    self.sample_tts(cfg)
                elif kind == "brain":
                    interval = max(2, cfg.get("brainIntervalSeconds", 2))
                    self.sample_brain(cfg)
                elif kind == "harness":
                    interval = 2
                    self.sample_harness(cfg)
                else:
                    interval = max(5, cfg.get("connectionsIntervalSeconds", 5))
                    value = sample_connections(cfg.get("connections", {}))
                    with self.lock:
                        self.connections = value
            except (OSError, ValueError, TypeError, KeyError):
                # Existing cached measurements expire even if a configuration edit is temporarily incomplete.
                pass
            with self.lock:
                self.counts[kind] += 1
            self.stop.wait(max(0.1, interval - (time.monotonic() - start)))

    def snapshot(self):
        now = time.time()
        with self.lock:
            models = [stale_model(copy.deepcopy(x), now) for x in self.models.values()]
            tts, connections = copy.deepcopy(self.tts), copy.deepcopy(self.connections)
            brain = stale_brain(copy.deepcopy(self.brain), now)
            harness = stale_harness(copy.deepcopy(self.harness), now)
        if tts["sampledAt"] is None or now - tts["sampledAt"] > tts["freshForSeconds"]:
            tts.update(connected=None, synthesizing=None, waiting=None, lastSynthesisSeconds=None)
            if not tts.get("pendingSampledAt"):
                tts["pending"] = None
        if tts.get("pendingSampledAt") is not None and now - tts["pendingSampledAt"] > 16:
            tts["pending"] = None
        if connections["sampledAt"] is None or now - connections["sampledAt"] > connections["freshForSeconds"]:
            connections.update(NEKO=None, MC=None, unclassified=None)
        dates = [x["sampledAt"] for x in models + [tts, connections, brain, harness] if x.get("sampledAt") is not None]
        return {"models": models, "tts": tts, "connections": connections, "brain": brain, "harness": harness,
                "updatedAt": max(dates) if dates else None, "serverTime": now}


def handler_for(collector):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = urllib.parse.urlsplit(self.path).path
            if path == "/favicon.ico":
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path == "/api/state":
                body = json.dumps(collector.snapshot(), ensure_ascii=False, allow_nan=False).encode()
                mime = "application/json; charset=utf-8"
            elif path == "/api/health":
                body = json.dumps({"status": "ok", "sharedSampler": True, "cycles": collector.counts}).encode()
                mime = "application/json"
            else:
                files = {"/": ("index.html", "text/html"), "/overlay": ("index.html", "text/html"),
                         "/brain": ("brain.html", "text/html"), "/dashboard.css": ("dashboard.css", "text/css"),
                         "/style.css": ("style.css", "text/css"), "/app.js": ("app.js", "text/javascript")}
                if path not in files:
                    self.send_error(404)
                    return
                file, mime = files[path]
                body = (ROOT / "public" / file).read_bytes()
                mime += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *_):
            pass
    return Handler


def main():
    parser = argparse.ArgumentParser()
    default_config = ROOT / "overlay.config.json"
    parser.add_argument("--config", default=str(default_config if default_config.exists() else ROOT / "overlay.config.example.json"))
    parser.add_argument("--port", type=int)
    args = parser.parse_args()
    cfg = read_config(args.config)
    collector = Collector(args.config)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port or cfg.get("port", 17840)), handler_for(collector))
    httpd.daemon_threads = True
    collector.start()
    print(f"OBS overlay: http://127.0.0.1:{httpd.server_port}/overlay (440 x 290)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        collector.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    main()
