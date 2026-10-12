"""Normalize read-only metadata; a missing counter is never a zero counter."""
from __future__ import annotations

import json
import math
import re
import time
from pathlib import Path

ACTIVE = {"reading", "generating"}
STATES = {"reading", "generating", "idle", "disconnected", "unknown"}


def number(value, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or (positive and value == 0):
        return None
    return value


def count(value):
    n = number(value)
    return int(n) if n is not None and n == int(n) else None


def throughput(row, explicit, tokens, seconds):
    value = number(row.get(explicit))
    if value is not None:
        return value
    numerator, denominator = count(row.get(tokens)), number(row.get(seconds), positive=True)
    return numerator / denominator if numerator is not None and denominator is not None else None


def obj(value):
    return value if isinstance(value, dict) else {}


def label(value):
    if not isinstance(value, str):
        return None
    return re.sub(r"[\x00-\x1f\x7f]", "", value).strip()[:128] or None


def quantization(value):
    text = label(value)
    if not text:
        return None
    match = re.search(r"(?i)(?:UD-)?(?:IQ\d_[A-Z0-9_]+|Q\d(?:_[A-Z0-9]+)+|MXFP4|NVFP4|FP8|BF16|FP16|F16|F32|INT8|INT4)", text)
    return match.group(0).upper() if match else None


def config_metadata(path):
    """Select model/configuration metadata without exposing the configuration object."""
    if not path:
        return {}
    try:
        with Path(path).open(encoding="utf-8-sig") as stream:
            cfg = obj(json.load(stream))
        args = cfg.get("args") if isinstance(cfg.get("args"), list) else []
        cap = None
        for key in ("--ctx", "--ctx-size", "--context", "-c"):
            if key in args and args.index(key) + 1 < len(args):
                raw = args[args.index(key) + 1]
                cap = number(int(raw), positive=True) if str(raw).isdigit() else None
                break
        if cap is None:
            for key in ("max_context", "ctx_size", "context_length", "ctx"):
                cap = number(cfg.get(key), positive=True)
                if cap is not None:
                    break
        model = label(cfg.get("model"))
        model_file = cfg.get("model_path") or cfg.get("gguf") or model
        if isinstance(model_file, str):
            model_file = model_file.replace("\\", "/").split("/")[-1]
        return {"contextLimit": cap, "quant": quantization(cfg.get("quant")) or quantization(model_file)}
    except (OSError, ValueError, TypeError):
        return {}


def blank_model(spec, sampled_at=None, reason="not-configured", state="disconnected"):
    return {
        "id": spec["id"], "label": spec["label"], "name": None, "quant": None,
        "state": state, "reason": reason, "sampledAt": sampled_at, "sourceAt": None,
        "freshForSeconds": 7, "queue": None, "inputTps": None, "outputTps": None,
        "inputSpeedKind": "realtime", "outputSpeedKind": "realtime",
        "executionSeconds": None, "executionKind": "current",
        "prefixReuseRatio": None, "contextTokens": None, "contextLimit": None,
        "contextPercent": None, "contextKind": "current", "running": None,
    }


def normalize_strata(raw, spec, sampled_at=None, metadata=None):
    """Strata serve/server.py Service.metrics; do not use hardware/KV occupancy as input length."""
    at = time.time() if sampled_at is None else sampled_at
    result = blank_model(spec, at, "missing-metrics", "unknown")
    raw = obj(raw)
    live, engine = obj(raw.get("live")), obj(raw.get("engine"))
    source_at = number(raw.get("time"), positive=True)
    # Remote clocks are not compared with the local clock. The collector detects frozen timestamps.
    result["sourceAt"] = source_at
    result["name"] = label(engine.get("model"))
    metadata = metadata or {}
    result["quant"] = quantization(engine.get("quant")) or quantization(engine.get("quantization")) or metadata.get("quant") or quantization(result["name"])
    result["contextLimit"] = number(engine.get("max_context"), positive=True) or metadata.get("contextLimit")
    state = live.get("state")
    result["state"] = state if state in STATES else "unknown"
    result["reason"] = None if state in {"idle", "reading", "generating"} else "missing-state"
    if state in ("unloaded", "error", "stopped", "failed"):
        result.update(state="disconnected", reason="engine-unavailable")
    queued, waiting = count(live.get("queued")), count(live.get("waiting"))
    # Parallel Strata has a second wait queue. Its absent field means serial only if parallel is absent.
    if queued is not None:
        result["queue"] = queued + (waiting or 0) if not live.get("parallel") or waiting is not None else None
    rows = raw.get("requests") if isinstance(raw.get("requests"), list) else []
    # The native endpoint returns newest first. The first row remains the last request even when incomplete.
    previous = obj(rows[0]) if rows else {}
    previous_total = count(previous.get("prompt_total"))
    reused = count(previous.get("reused"))
    if previous_total and reused is not None and reused <= previous_total:
        result["prefixReuseRatio"] = reused / previous_total
    if state in ACTIVE:
        result["running"] = count(live.get("running"))
        # A batched aggregate cannot safely combine one slot's context with another slot's speed/time.
        if result["running"] is not None and result["running"] > 1:
            result["reason"] = "multiple-active-requests"
            return result
        result["contextTokens"] = count(live.get("prompt_tokens"))
        # Native prompt_total is read from the engine's progress cache; prompt_tokens is the
        # server's tokenized whole request. A missing whole request must not borrow old progress.
        phase = live.get("phase")
        # Serial Strata starts this clock AFTER tokenization, FIFO waiting and ensure_loaded.
        # Batched admission starts before its internal wait; its wall clock is not execution time.
        execution_phases = {"reading the prompt", "thinking", "answering", "tool call complete"}
        executing = phase in execution_phases or (isinstance(phase, str) and phase.startswith("writing a tool call:"))
        if executing and not live.get("parallel"):
            result["executionSeconds"] = number(live.get("elapsed_s"))
        elif not executing:
            result["reason"] = "preparing-request"
        # Prefill in Strata is a phase mean over newly read tokens, rather than cached-token / wall time.
        if state == "reading" and not live.get("parallel") and result["contextTokens"] is not None:
            result["inputTps"] = number(live.get("prefill_tok_s_mean"))
        if state == "generating":
            result["outputTps"] = number(live.get("tok_s"))
            if not live.get("parallel") and result["contextTokens"] is not None:
                result["inputTps"] = number(live.get("prefill_tok_s_mean"))
    elif state == "idle":
        result.update(inputSpeedKind="last", outputSpeedKind="last", executionKind="last", contextKind="last")
        result["contextTokens"] = previous_total
        result["outputTps"] = number(previous.get("decode_tok_s"))
        prompt_ms = number(previous.get("prompt_ms"), positive=True)
        if prompt_ms is not None and previous_total is not None and reused is not None and reused <= previous_total:
            # A cancelled read's prompt_tokens may be smaller than its whole prompt_total.
            seen = count(previous.get("prompt_tokens"))
            if seen is not None and seen >= reused:
                result["inputTps"] = (seen - reused) / (prompt_ms / 1000)
        decode_ms = number(previous.get("decode_ms"))
        prompt_ms_any = number(previous.get("prompt_ms"))
        if prompt_ms_any is not None and decode_ms is not None:
            result["executionSeconds"] = (prompt_ms_any + decode_ms) / 1000
    total, limit = result["contextTokens"], result["contextLimit"]
    if total is not None and limit is not None:
        result["contextPercent"] = total / limit * 100
    return result


def normalize_metadata(raw, spec, sampled_at=None, metadata=None):
    """Compact contract or gateway projection; explicit unknowns override native fields."""
    raw = obj(raw)
    live, previous = obj(raw.get("live")), obj(raw.get("last"))
    # LiteLLM retains Strata's engine/live/requests but also publishes this explicit
    # live/last projection, without a root schema tag. Its queued count is already
    # reconciled, and a null execution_seconds must not fall back to phase sums.
    projected = all(key in live and key in previous for key in ("context_tokens", "execution_seconds"))
    if raw.get("schema") != "obs-inference-v1" and not projected:
        return normalize_strata(raw, spec, sampled_at, metadata)
    at = time.time() if sampled_at is None else sampled_at
    result = blank_model(spec, at, "missing-metrics", "unknown")
    engine, live, previous = obj(raw.get("engine")), obj(raw.get("live")), obj(raw.get("last"))
    metadata = metadata or {}
    result.update(sourceAt=number(raw.get("time"), positive=True), name=label(engine.get("model")),
                  quant=quantization(engine.get("quantization")) or quantization(engine.get("quant")) or metadata.get("quant") or quantization(engine.get("model")),
                  contextLimit=number(engine.get("max_context"), positive=True) or metadata.get("contextLimit"))
    state = live.get("state")
    if state in STATES:
        result.update(state=state, reason=None)
    result["queue"] = count(live.get("queued"))
    total, reused = count(previous.get("context_tokens")), count(previous.get("reused_tokens"))
    if total and reused is not None and reused <= total:
        result["prefixReuseRatio"] = reused / total
    if state in ACTIVE:
        result["running"] = count(live.get("running"))
        if result["running"] is not None and result["running"] > 1:
            result["reason"] = "multiple-active-requests"
            return result
        if label(live.get("request_id")):
            result.update(contextTokens=count(live.get("context_tokens")),
                          executionSeconds=number(live.get("execution_seconds")),
                          inputTps=throughput(live, "input_tok_s", "input_processed_tokens", "input_processing_seconds"),
                          outputTps=throughput(live, "output_tok_s", "output_tokens", "decode_seconds") if state == "generating" else None)
        else:
            result["reason"] = "missing-request-id"
    elif state == "idle":
        result.update(inputSpeedKind="last", outputSpeedKind="last", executionKind="last", contextKind="last",
                      contextTokens=total, executionSeconds=number(previous.get("execution_seconds")),
                      inputTps=throughput(previous, "input_tok_s", "input_processed_tokens", "input_processing_seconds"),
                      outputTps=throughput(previous, "output_tok_s", "output_tokens", "decode_seconds"))
    if result["contextTokens"] is not None and result["contextLimit"] is not None:
        result["contextPercent"] = result["contextTokens"] / result["contextLimit"] * 100
    return result


def normalize_model_health(raw, spec, sampled_at=None):
    """Health proves reachability/model identity, not idle, throughput or absence of queued work."""
    result = blank_model(spec, sampled_at or time.time(), "metrics-unavailable", "unknown")
    if obj(raw).get("status") in ("ok", "ready"):
        result["name"] = label(raw.get("model"))
        result["quant"] = quantization(raw.get("quantization"))
    else:
        result.update(state="disconnected", reason="unhealthy")
    return result


def normalize_tts(raw, sampled_at=None, *, health_only=False):
    at = sampled_at or time.time()
    raw = obj(raw)
    result = {"sampledAt": at, "sourceAt": number(raw.get("time")), "freshForSeconds": 16,
              "connected": raw.get("status") in ("ok", "ready"), "label": "本地 TTS",
              "synthesizing": None, "waiting": None, "lastSynthesisSeconds": None, "pending": None}
    # Only explicit metadata counters. requests_served, playing and queue duration are not substitutes.
    if not health_only:
        result.update(synthesizing=count(raw.get("synthesizing")), waiting=count(raw.get("waiting")),
                      pending=count(raw.get("pending_items")), lastSynthesisSeconds=number(raw.get("last_synthesis_seconds")))
    return result


def stale_model(model, now):
    at = model.get("sampledAt")
    if at is not None and now - at > model["freshForSeconds"]:
        stale = blank_model(model, at, "stale", "disconnected")
        stale.update(name=model.get("name"), quant=model.get("quant"))
        return stale
    return model
