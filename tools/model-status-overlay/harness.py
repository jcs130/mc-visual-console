"""Normalize host-independent execution metadata without promoting host claims to verified learning."""
from __future__ import annotations
import time
from metrics import count, number, label


def obj(value):
    return value if isinstance(value, dict) else {}


def blank_harness():
    return {"sampledAt": None, "sourceAt": None, "freshForSeconds": 7, "source": "not-configured",
            "run": None, "phase": None, "window": None, "tools": None, "models": [], "learning": None}


def distribution(raw):
    raw = obj(raw)
    samples, p50, p95 = count(raw.get("samples")), number(raw.get("p50")), number(raw.get("p95"))
    valid = samples is not None and samples > 0 and p50 is not None and p95 is not None and p50 <= p95
    return {"samples": samples, "p50": p50 if valid else None, "p95": p95 if valid else None}


def normalize_harness(raw, sampled_at=None):
    raw = obj(raw)
    value = blank_harness()
    source_at = number(raw.get("time"), positive=True)
    if raw.get("schema") != "agent-harness-metrics-v1" or source_at is None:
        return value
    window = obj(raw.get("window"))
    if window.get("seconds") != 600:
        return value
    value.update(sampledAt=time.time() if sampled_at is None else sampled_at, sourceAt=source_at,
                 source="harness-metadata", run=label(raw.get("run")), phase=label(raw.get("phase")),
                 window={"coveredSeconds": number(window.get("coveredSeconds")), "complete": window.get("complete") is True})
    tools = obj(raw.get("tools"))
    if tools.get("source") == "runtime-measured":
        value["tools"] = {key: count(tools.get(key)) for key in ("calls", "returned", "errors", "active")}
        value["tools"]["elapsedMs"] = distribution(tools.get("elapsedMs"))
    for model in raw.get("models", []) if isinstance(raw.get("models"), list) else []:
        model = obj(model)
        if model.get("role") not in ("system1", "system2", "background") or model.get("source") != "host-reported":
            continue
        row = {key: count(model.get(key)) for key in ("calls", "completed", "active", "failed", "cancelled", "cacheSamples")}
        ratio = number(model.get("cacheRatio"))
        row.update(role=model["role"], source="host-reported", cacheRatio=ratio if ratio is not None and ratio <= 1 else None,
                   elapsedMs=distribution(model.get("elapsedMs")), ttftMs=distribution(model.get("ttftMs")))
        for key in ("inputTokens", "outputTokens", "reasoningTokens", "cachedTokens"):
            token = obj(model.get(key))
            row[key] = {"samples": count(token.get("samples")), "total": count(token.get("total"))}
        value["models"].append(row)
    learning = obj(raw.get("learning"))
    if learning.get("source") == "host-reported":
        stages = obj(learning.get("stages"))
        value["learning"] = {"source": "host-reported", "reportedEvents": count(learning.get("reportedEvents")),
            "stages": {key: count(stages.get(key)) for key in ("authored", "revised", "validated", "executed", "evaluated", "reused", "reverted")},
            "latest": [], "environmentVerifiedImprovement": None}
        latest = learning.get("latest", [])
        for event in latest[-12:] if isinstance(latest, list) else []:
            event = obj(event)
            value["learning"]["latest"].append({key: label(event.get(key)) for key in
                ("id", "method", "author", "sourceHash", "parentHash", "stage", "artifact", "receipt", "executionId", "outcome")})
    return value


def stale_harness(value, now):
    at, source = value.get("sampledAt"), value.get("sourceAt")
    if at is not None and (now - at > 7 or source is not None and abs(now - source) > 7):
        return blank_harness() | {"source": "stale"}
    return value
