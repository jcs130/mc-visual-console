const QUALITY_MODES = Object.freeze(["high", "balanced", "performance"]);
const HIGH_DETAIL_NPC_MODEL_BUDGETS = Object.freeze({
  high: 4,
  balanced: 3,
  performance: 2,
});

/**
 * Build a small hysteretic quality controller for the viewer. It only changes
 * DPR after several whole-second samples, so short chunk-meshing spikes do not
 * make the picture pulse between resolutions.
 */
export function createAdaptiveQualityController(options = {}) {
  const nativePixelRatio = boundedNumber(options.nativePixelRatio, 1, 4, 1);
  const maximumPixelRatio = Math.min(
    nativePixelRatio,
    boundedNumber(options.maximumPixelRatio, 1, 2, 1.75),
  );
  const preference = normalizeQualityPreference(options.preference);
  const profiles = buildProfiles(maximumPixelRatio);
  const lowFpsThreshold = boundedNumber(options.lowFpsThreshold, 20, 58, 44);
  const recoveryFpsThreshold = Math.max(
    lowFpsThreshold + 2,
    boundedNumber(options.recoveryFpsThreshold, 30, 60, 55),
  );
  const pressureSamples = boundedInteger(options.pressureSamples, 2, 12, 3);
  const recoverySamples = boundedInteger(options.recoverySamples, 4, 30, 10);
  const warmupSamples = boundedInteger(options.warmupSamples, 0, 20, 4);
  let level = preference === "auto"
    ? 0
    : Math.max(0, profiles.findIndex((profile) => profile.mode === preference));
  let samples = 0;
  let pressureStreak = 0;
  let recoveryStreak = 0;
  let changes = 0;
  let lastFps = null;

  const snapshot = (changed = false, reason = null) => Object.freeze({
    preference,
    mode: profiles[level].mode,
    pixelRatio: profiles[level].pixelRatio,
    nativePixelRatio,
    estimatedPixelWork: round((profiles[level].pixelRatio / nativePixelRatio) ** 2, 3),
    samples,
    changes,
    pressureStreak,
    recoveryStreak,
    lastFps,
    changed,
    reason,
  });

  return Object.freeze({
    sample(sample = {}) {
      const fps = Number(sample.fps);
      if (sample.hidden === true || !Number.isFinite(fps) || fps <= 0) {
        pressureStreak = 0;
        recoveryStreak = 0;
        return snapshot(false, sample.hidden === true ? "hidden" : "invalid-sample");
      }
      samples += 1;
      lastFps = round(fps, 1);
      if (preference !== "auto" || samples <= warmupSamples) {
        return snapshot(false, preference === "auto" ? "warmup" : "fixed");
      }

      if (fps < lowFpsThreshold) {
        pressureStreak += 1;
        recoveryStreak = 0;
      } else if (fps > recoveryFpsThreshold) {
        recoveryStreak += 1;
        pressureStreak = 0;
      } else {
        pressureStreak = 0;
        recoveryStreak = 0;
      }

      if (pressureStreak >= pressureSamples && level < profiles.length - 1) {
        level += 1;
        changes += 1;
        pressureStreak = 0;
        recoveryStreak = 0;
        return snapshot(true, "sustained-frame-pressure");
      }
      if (recoveryStreak >= recoverySamples && level > 0) {
        level -= 1;
        changes += 1;
        pressureStreak = 0;
        recoveryStreak = 0;
        return snapshot(true, "sustained-recovery");
      }
      return snapshot(false, "stable");
    },
    getSnapshot() {
      return snapshot();
    },
  });
}

export function normalizeQualityPreference(value) {
  const candidate = String(value || "auto").trim().toLowerCase();
  return QUALITY_MODES.includes(candidate) ? candidate : "auto";
}

export function rateLimitDelayMs(lastRunAt, now, intervalMs) {
  const previous = Number(lastRunAt);
  const current = Number(now);
  const interval = boundedNumber(intervalMs, 16, 1_000, 80);
  if (!Number.isFinite(current)) return interval;
  if (!Number.isFinite(previous) || previous <= 0 || current - previous >= interval) {
    return 0;
  }
  return Math.max(0, Math.ceil(interval - (current - previous)));
}

/**
 * Return the bounded number of authored, high-detail NPC models allowed by a
 * semantic quality mode. `auto` is a preference rather than an active mode;
 * callers should normally pass the controller snapshot's mode. Unknown input
 * deliberately receives the conservative balanced budget.
 */
export function highDetailNpcModelBudget(qualityMode) {
  const mode = String(qualityMode || "").trim().toLowerCase();
  return HIGH_DETAIL_NPC_MODEL_BUDGETS[mode] ?? HIGH_DETAIL_NPC_MODEL_BUDGETS.balanced;
}

/**
 * Select stable NPC ids for high-detail rendering without mutating candidates.
 * Gameplay importance wins first, then camera distance, with the id as the
 * deterministic final tie-breaker. Duplicate ids consume only one slot.
 *
 * @param {unknown[]} candidates
 * @param {unknown} qualityMode
 * @returns {readonly string[]}
 */
export function selectHighDetailNpcModelIds(candidates, qualityMode) {
  const normalized = [];
  const seen = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate !== "object") continue;
    const id = String(candidate.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      priority: finiteNumber(candidate.priority, 0),
      distance: nonNegativeNumber(candidate.distance, Number.POSITIVE_INFINITY),
    });
  }
  normalized.sort((left, right) => (
    right.priority - left.priority
    || left.distance - right.distance
    || stableStringCompare(left.id, right.id)
  ));
  return Object.freeze(normalized
    .slice(0, highDetailNpcModelBudget(qualityMode))
    .map((candidate) => candidate.id));
}

function buildProfiles(maximumPixelRatio) {
  const requested = [
    { mode: "high", pixelRatio: maximumPixelRatio },
    { mode: "balanced", pixelRatio: Math.max(1, maximumPixelRatio - 0.35) },
    { mode: "performance", pixelRatio: 1 },
  ];
  // Keep semantic levels even when a DPR=1 display makes their pixel ratios
  // identical. Other policies (shadows, authored NPC budgets, effects) still
  // need the controller to move through balanced and performance modes.
  return Object.freeze(requested.map((profile) => Object.freeze({
    mode: profile.mode,
    pixelRatio: round(profile.pixelRatio, 2),
  })));
}

function finiteNumber(value, fallback) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function nonNegativeNumber(value, fallback) {
  const candidate = finiteNumber(value, fallback);
  return candidate >= 0 ? candidate : fallback;
}

function stableStringCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function boundedNumber(value, minimum, maximum, fallback) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : fallback;
}

function boundedInteger(value, minimum, maximum, fallback) {
  return Math.round(boundedNumber(value, minimum, maximum, fallback));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
