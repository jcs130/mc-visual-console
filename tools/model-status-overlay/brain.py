"""Framework policy metadata is independent of engine utilization and prompt content."""
from __future__ import annotations

import json
import time
from pathlib import Path

from metrics import count, label, number, obj

PHASES = {"idle", "delivering", "model", "tools", "backoff", "handoff"}
ROLES = {"main", "system1", "planning", "reflection", "cognition", "dream"}
ORIGINS = {"adaptive", "configured", "inherited", "fallback", "manual", "mixed"}
READING = {"focused", "connected", "standard", "full"}
COUNTERS = ("eligible_requests", "adaptive_applied", "selector_attempts", "selector_timeouts",
            "selector_unavailable", "selector_uncertain", "selector_stale", "calls", "failed_calls", "retries",
            "verified_success", "verified_failed", "unknown_tasks", "recovery_cases", "recovered",
            "input_tokens", "output_tokens", "reasoning_tokens")
EFFORTS = ("off", "minimal", "low", "medium", "high", "xhigh", "max", "default", "other", "unknown")
LEGACY_EFFORTS = ("off", "low", "medium", "high", "default", "other", "unknown")


def boolean(value):
    return value if isinstance(value, bool) else None


def choice(value, allowed):
    return value if isinstance(value, str) and value in allowed else None


def fraction(numerator, denominator):
    return numerator / denominator if numerator is not None and denominator and numerator <= denominator else None


def reasoning_distribution(raw, *, effective=False, legacy=False):
    raw = obj(raw)
    depths = {key: count(obj(raw.get("effort_counts")).get(key)) for key in (LEGACY_EFFORTS if legacy else EFFORTS)}
    if any(value is None for value in depths.values()):
        return None
    if legacy:
        samples = sum(depths.values())
        # Old producers folded none/minimal/xhigh/max into other; its enablement is unknown.
        modes = {"on": sum(depths[key] for key in ("low", "medium", "high", "default")),
                 "off": depths["off"], "unknown": depths["unknown"] + depths["other"]}
    else:
        samples = count(raw.get("samples"))
        modes = {key: count(obj(raw.get("thinking_counts")).get(key)) for key in ("on", "off", "unknown")}
    if samples is None or any(value is None for value in modes.values()) \
            or sum(modes.values()) != samples or sum(depths.values()) != samples:
        return None
    confirmed = count(raw.get("confirmed_samples")) if effective else None
    if effective and (confirmed is None or confirmed > samples or modes["on"] + modes["off"] > confirmed):
        return None
    return {"samples": samples, "confirmedSamples": confirmed, "thinkingCounts": modes, "effortCounts": depths,
            "thinkingRates": {key: fraction(value, samples) for key, value in modes.items()},
            "effortRates": {key: fraction(value, samples) for key, value in depths.items()}}


def configuration(path):
    """Read only declared policy numbers/flags. File values never become current-request choices."""
    result = {"sampledAt": None, "source": "deployment-config", "automaticReading": None,
              "automaticReasoning": None, "focusedHistoryTokens": None, "standardHistoryTokens": None,
              "growthTokens": None, "stageBudgetTokens": None, "routineEffort": None, "deliberateEffort": None}
    if not path:
        return result
    try:
        raw = obj(json.loads(Path(path).read_text(encoding="utf-8-sig")))
        foreground, fast, context = obj(raw.get("foreground")), obj(raw.get("fastForeground")), obj(raw.get("context"))
        def enabled(*flags):
            return False if False in flags else True if all(flag is True for flag in flags) else None
        result.update(sampledAt=time.time(), automaticReading=enabled(boolean(foreground.get("enabled")), boolean(fast.get("enabled"))),
                      automaticReasoning=enabled(boolean(fast.get("enabled")), boolean(fast.get("reasoningEnabled"))),
                      focusedHistoryTokens=count(fast.get("focusedHistoryTokens")),
                      standardHistoryTokens=count(foreground.get("maxHistoryTokens")),
                      growthTokens=count(foreground.get("maxGrowthTokens")), stageBudgetTokens=count(context.get("maxTokens")),
                      routineEffort=label(fast.get("reasoningRoutineEffort")), deliberateEffort=label(fast.get("reasoningDeliberateEffort")))
    except (OSError, ValueError, TypeError):
        pass
    return result


def blank_brain(policy=None):
    return {"sampledAt": None, "sourceAt": None, "freshForSeconds": 7, "connected": None,
            "source": "not-configured", "phase": None, "paused": None,
            "activeConnection": {"name": None, "model": None}, "stageBudgetTokens": None,
            "inputHardLimit": None, "configuration": policy or configuration(None),
            "selection": None, "statistics": None}


def normalize_status(raw, policy=None, sampled_at=None):
    result = blank_brain(policy)
    raw = obj(raw)
    loop, connection = obj(raw.get("loop")), obj(raw.get("modelConnection"))
    if not loop:
        return result
    result.update(sampledAt=time.time() if sampled_at is None else sampled_at, source="cortico-status", connected=True,
                  phase=choice(obj(loop.get("phase")).get("state"), PHASES), paused=boolean(loop.get("paused")),
                  activeConnection={"name": label(connection.get("name")), "model": label(connection.get("model"))},
                  stageBudgetTokens=count(obj(raw.get("context")).get("maxTokens")),
                  inputHardLimit=count(obj(loop.get("context")).get("hardTokens")))
    # estTokens is the stored/next context estimate, not this request's complete actual input.
    return result


def normalize_selection(raw):
    raw = obj(raw)
    if raw.get("scope") not in ("current", "last") or not label(raw.get("decision_id")):
        return None
    applied, proposed, context = obj(raw.get("applied")), obj(raw.get("proposed")), obj(raw.get("context"))
    sources = obj(raw.get("sources"))
    request_id = label(raw.get("request_id"))
    matched = request_id is not None and request_id == label(raw.get("inference_request_id"))
    confirmed = boolean(raw.get("provider_confirmed")) if matched else None
    effective = obj(raw.get("provider_effective")) if matched and confirmed is True else {}
    requested = obj(raw.get("provider_requested")) if matched else {}
    confidence = number(raw.get("confidence"))
    result = {"scope": raw["scope"], "round": count(raw.get("round")),
              "role": choice(applied.get("role"), ROLES), "model": label(applied.get("model")),
              "origin": choice(raw.get("origin"), ORIGINS), "reading": choice(applied.get("reading"), READING),
              "routeOrigin": choice(sources.get("route"), ORIGINS - {"mixed"}),
              "readingOrigin": choice(sources.get("reading"), ORIGINS - {"mixed"}),
              "reasoningOrigin": choice(sources.get("reasoning"), ORIGINS - {"mixed"}),
              "proposedReading": choice(proposed.get("reading"), READING),
              "proposedReasoning": choice(proposed.get("reasoning"), {"immediate", "routine", "deliberate"}),
              "thinking": boolean(applied.get("thinking")), "effort": label(applied.get("effort")),
              "proposedEffort": label(proposed.get("effort")), "providerConfirmed": confirmed,
              "reasoningBudgetTokens": count(applied.get("reasoning_budget_tokens")),
              "providerRequestedThinking": boolean(requested.get("thinking")), "providerRequestedEffort": label(requested.get("effort")),
              "providerRequestedBudgetTokens": count(requested.get("budgetTokens")),
              "effectiveThinking": boolean(effective.get("thinking")), "effectiveEffort": label(effective.get("effort")),
              "effectiveNativeEffort": label(effective.get("nativeEffort")), "effectiveReasoningBudgetTokens": count(effective.get("budgetTokens")),
              "effectiveBudgetStatus": label(effective.get("budgetStatus")),
              "executionSeconds": number(raw.get("execution_ms")) / 1000 if matched and number(raw.get("execution_ms")) is not None else None,
              "queueSeconds": number(raw.get("queue_ms")) / 1000 if matched and number(raw.get("queue_ms")) is not None else None,
              "reasoningTokens": count(raw.get("reasoning_tokens")) if matched else None,
              "requestedHistoryTokens": count(context.get("requested_history_tokens")),
              "historyTokens": count(context.get("applied_history_tokens")), "growthTokens": count(context.get("growth_tokens")),
              "protectedTokens": count(context.get("protected_tokens")),
              "estimatedInputTokens": count(context.get("estimated_input_tokens")),
              "actualInputTokens": count(context.get("actual_input_tokens")) if matched else None,
              "selectorMs": number(raw.get("selector_ms")), "confidence": confidence if confidence is not None and confidence <= 1 else None}
    return result


def normalize_statistics(raw):
    raw = obj(raw)
    # The OBS summary has a fixed 10-minute label; never relabel a lifetime aggregate as a window.
    if raw.get("window_seconds") != 600:
        return None
    start, end = number(raw.get("from")), number(raw.get("to"))
    if start is None or end is None or end < start or abs(end - start - 600) > 2:
        return None
    result = {key: count(raw.get(key)) for key in COUNTERS}
    covered = number(raw.get("covered_seconds"))
    result.update(startAt=start, endAt=end, complete=boolean(raw.get("complete")),
                  coveredSeconds=covered if covered is not None and covered <= 600 else None)
    result["taskVerificationAvailable"] = boolean(raw.get("task_verification_available"))
    result["recoveryAvailable"] = boolean(raw.get("recovery_available"))
    result["usageSamples"] = {key: count(obj(raw.get("usage_samples")).get(key)) for key in ("attempts", "input", "output", "reasoning")}
    result["adaptiveRate"] = fraction(result["adaptive_applied"], result["eligible_requests"])
    reasons = [result[k] for k in ("selector_timeouts", "selector_unavailable", "selector_uncertain", "selector_stale")]
    result["fallbackCount"] = sum(reasons) if all(n is not None for n in reasons) else None
    result["fallbackRate"] = fraction(result["fallbackCount"], result["selector_attempts"])
    result["failedCallRate"] = fraction(result["failed_calls"], result["calls"])
    success, failed = result["verified_success"], result["verified_failed"]
    result["verifiedTotal"] = success + failed if success is not None and failed is not None else None
    result["taskSuccessRate"] = fraction(success, result["verifiedTotal"])
    result["recoveryRate"] = fraction(result["recovered"], result["recovery_cases"])
    # Each bucket has a separate unknown count. Missing buckets are not zero observations.
    result["readingCounts"] = {key: count(obj(raw.get("reading_counts")).get(key)) for key in ("focused", "connected", "standard", "full", "unknown")}
    result["effortCounts"] = {key: count(obj(raw.get("effort_counts")).get(key)) for key in EFFORTS}
    result["requestedReasoning"] = reasoning_distribution(raw.get("requested_reasoning")) if "requested_reasoning" in raw \
        else reasoning_distribution({"effort_counts": raw.get("effort_counts")}, legacy=True)
    result["effectiveReasoning"] = reasoning_distribution(raw.get("effective_reasoning"), effective=True)
    result["routeCounts"] = {key: count(obj(raw.get("route_counts")).get(key)) for key in (*sorted(ROLES), "unknown")}
    result["contextDistributions"] = {}
    for key in ("history_budget", "matched_input", "reasoning_budget"):
        distribution = obj(obj(raw.get("context_distributions")).get(key))
        samples, p50, p95 = count(distribution.get("samples")), count(distribution.get("p50_tokens")), count(distribution.get("p95_tokens"))
        valid = samples is not None and samples > 0 and p50 is not None and p95 is not None and p50 <= p95
        result["contextDistributions"][key] = {"samples": samples, "p50": p50 if valid else None, "p95": p95 if valid else None}
    if result["output_tokens"] is not None and result["reasoning_tokens"] is not None and result["reasoning_tokens"] > result["output_tokens"]:
        result["reasoning_tokens"] = None
    return result


def normalize_brain(raw, policy=None, sampled_at=None):
    raw = obj(raw)
    if raw.get("schema") != "cortico-brain-metrics-v1":
        return blank_brain(policy)
    source_at = number(raw.get("time"), positive=True)
    if source_at is None:
        return blank_brain(policy)
    result = blank_brain(policy)
    result.update(sampledAt=time.time() if sampled_at is None else sampled_at, sourceAt=number(raw.get("time"), positive=True),
                  source="brain-metrics", connected=True, phase=choice(raw.get("phase"), PHASES), paused=boolean(raw.get("paused")),
                  selection=normalize_selection(raw.get("selection")), statistics=normalize_statistics(raw.get("window")))
    connection = obj(raw.get("active_connection"))
    result.update(activeConnection={"name": label(connection.get("name")), "model": label(connection.get("model"))},
                  stageBudgetTokens=count(raw.get("stage_budget_tokens")), inputHardLimit=count(raw.get("input_hard_limit")))
    if result["statistics"] and abs(source_at - result["statistics"]["endAt"]) > 7:
        result["statistics"] = None
    return result


def stale_brain(value, now):
    at = value.get("sampledAt")
    if at is not None and now - at > value["freshForSeconds"]:
        value = blank_brain(value.get("configuration")) | {"source": "stale"}
    cfg = value["configuration"]
    if cfg.get("sampledAt") is not None and now - cfg["sampledAt"] > 7:
        value["configuration"] = configuration(None)
    return value
