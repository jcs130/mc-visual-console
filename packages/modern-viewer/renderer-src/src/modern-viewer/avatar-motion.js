/**
 * Renderer-independent avatar motion primitives.
 *
 * This module deliberately imports neither Three.js nor skinview3d.  It turns
 * the comparatively sparse Mineflayer stream into a stable semantic motion
 * state, then applies a pose through the small, duck-typed surface exposed by
 * skinview3d's PlayerObject (`skin.head`, `skin.leftArm`, ...).  A future GLTF
 * or VRM adapter can consume AvatarMotionGraph without reusing the pose writer.
 */

const TICK_SECONDS = 0.05;
const TELEPORT_DISTANCE = 4;
const TWO_PI = Math.PI * 2;
const HEAD_YAW_LIMIT = Math.PI * (75 / 180);
const LOCOMOTION_STATES = Object.freeze([
  "idle",
  "walk",
  "run",
  "crouch",
  "crouchWalk",
  "jump",
  "fall",
  "land",
  "swim",
  "fly",
  "ride",
]);
const MOVING_STATES = new Set(["walk", "run", "crouchWalk", "swim", "fly"]);

const DEFAULT_GRAPH_OPTIONS = Object.freeze({
  walkEnterSpeed: 0.018,
  walkExitSpeed: 0.008,
  runEnterSpeed: 0.13,
  runExitSpeed: 0.095,
  verticalThreshold: 0.018,
  speedDamping: 12,
  bodyYawDamping: 10,
  headYawDamping: 14,
  pitchDamping: 14,
  landingDurationMs: 180,
  walkStrideBlocks: 1.25,
  runStrideBlocks: 1.65,
  swimStrideBlocks: 1.8,
});

const DEFAULT_ACTION_DURATIONS = Object.freeze({
  swing: 430,
  hurt: 260,
  use: 650,
});

/**
 * Normalize a server/client entity payload into one stable MotionFrame.
 *
 * Mineflayer velocities are expressed in blocks per game tick.  A missing
 * velocity is therefore derived from position delta / elapsed 50 ms ticks,
 * rather than blocks per second.  A displacement greater than four blocks is
 * marked as a teleport and is never converted into movement velocity.
 *
 * @param {unknown} raw
 * @param {ReturnType<typeof normalizeMotionFrame> | null | undefined} previous
 * @param {number} [receivedAt]
 */
export function normalizeMotionFrame(raw, previous, receivedAt = Date.now()) {
  const source = record(raw);
  const entity = record(source.entity);
  const prior = previous && typeof previous === "object" ? previous : null;
  const received = finiteNumber(receivedAt, Date.now());
  const capturedAt = firstFinite(
    source.capturedAt,
    source.timestamp,
    source.serverTimeMs,
    entity.capturedAt,
    received,
  );
  const seq = finiteInteger(source.seq)
    ?? finiteInteger(entity.seq)
    ?? (finiteInteger(prior?.seq) ?? -1) + 1;

  const incomingPosition = vector(source.position ?? source.pos ?? entity.position ?? entity.pos);
  const position = incomingPosition ?? cloneVector(prior?.position) ?? zeroVector();
  const priorPosition = vector(prior?.position);
  const incomingVelocity = vector(source.velocity ?? entity.velocity);

  const elapsedMs = elapsedBetween(prior, capturedAt, received);
  const elapsedTicks = elapsedMs > 0 ? elapsedMs / (TICK_SECONDS * 1_000) : 0;
  const delta = priorPosition && incomingPosition
    ? subtractVector(position, priorPosition)
    : zeroVector();
  const horizontalDistance = Math.hypot(delta.x, delta.z);
  const spatialDistance = Math.hypot(delta.x, delta.y, delta.z);
  const teleported = Boolean(priorPosition && incomingPosition && spatialDistance > TELEPORT_DISTANCE);
  const canDeriveVelocity = Boolean(priorPosition && incomingPosition && elapsedTicks > 0 && !teleported);
  const derivedVelocity = canDeriveVelocity
    ? scaleVector(delta, 1 / elapsedTicks)
    : zeroVector();
  const velocityDerived = !incomingVelocity && canDeriveVelocity;
  const velocity = incomingVelocity ?? (velocityDerived ? derivedVelocity : zeroVector());

  // Position deltas are the most faithful measure when available.  Explicit
  // velocity remains useful on the first packet and while a move is beginning.
  const observedHorizontalSpeed = teleported
    ? 0
    : canDeriveVelocity
      ? horizontalDistance / elapsedTicks
      : Math.hypot(velocity.x, velocity.z);
  const observedVerticalSpeed = teleported
    ? 0
    : canDeriveVelocity
      ? delta.y / elapsedTicks
      : velocity.y;

  const yaw = angleValue(source.yaw ?? entity.yaw, prior?.yaw ?? 0);
  const headYaw = angleValue(source.headYaw ?? entity.headYaw, prior?.headYaw ?? yaw);
  const pitch = clamp(
    finiteNumber(source.pitch ?? entity.pitch, prior?.pitch ?? 0),
    -Math.PI / 2,
    Math.PI / 2,
  );

  return {
    seq,
    capturedAt,
    receivedAt: received,
    position,
    velocity,
    yaw,
    headYaw,
    pitch,
    onGround: booleanValue(source.onGround, entity.onGround, prior?.onGround, true),
    inWater: booleanValue(source.inWater, source.isInWater, entity.inWater, entity.isInWater, prior?.inWater, false),
    inLava: booleanValue(source.inLava, source.isInLava, entity.inLava, entity.isInLava, prior?.inLava, false),
    elytraFlying: booleanValue(source.elytraFlying, entity.elytraFlying, source.flying, prior?.elytraFlying, false),
    riding: booleanValue(
      source.riding,
      entity.riding,
      source.vehicle != null ? true : undefined,
      entity.vehicle != null ? true : undefined,
      prior?.riding,
      false,
    ),
    sneaking: booleanValue(source.sneaking, source.crouching, entity.sneaking, entity.crouching, prior?.sneaking, false),
    sprinting: booleanValue(source.sprinting, entity.sprinting, prior?.sprinting, false),
    usingHeldItem: booleanValue(source.usingHeldItem, entity.usingHeldItem, prior?.usingHeldItem, false),

    // Derived fields are intentionally public diagnostics.  Consumers may
    // ignore them, but keeping them on the immutable-ish frame makes tests and
    // future GLTF adapters deterministic.
    elapsedSeconds: elapsedMs / 1_000,
    horizontalDistance: teleported ? 0 : horizontalDistance,
    horizontalSpeed: observedHorizontalSpeed,
    verticalSpeed: observedVerticalSpeed,
    teleported,
    velocityDerived,
  };
}

/**
 * Pure semantic motion graph with hysteresis and a distance-driven gait.
 *
 * `now` is injectable and `update(delta)` also advances an internal logical
 * clock, so tests do not need wall-clock sleeps.
 */
export class AvatarMotionGraph {
  /**
   * @param {{ now?: () => number, [key: string]: unknown }} [options]
   */
  constructor(options = {}) {
    this.options = normalizeGraphOptions(options);
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.clockMs = finiteNumber(this.now(), Date.now());
    this.frame = null;
    this.state = "idle";
    this.previousState = "idle";
    this.stateChangedAt = this.clockMs;
    this.landUntil = 0;
    this.gaitPhase = 0;
    this.predictedDistanceSinceSample = 0;
    this.targetHorizontalSpeed = 0;
    this.smoothedHorizontalSpeed = 0;
    this.bodyYaw = 0;
    this.headYaw = 0;
    this.pitch = 0;
    this.anglesInitialized = false;
    this.sampleCount = 0;
    this.duplicateSampleCount = 0;
    this.transitionCount = 0;
    this.teleportCount = 0;
    this.lastSampleIdentity = null;
  }

  /**
   * Accept either a raw stream payload or an already normalized MotionFrame.
   * @param {unknown} raw
   * @param {number} [receivedAt]
   */
  setMotion(raw, receivedAt = this.currentExternalTime()) {
    this.syncClock();
    const prior = this.frame;
    const frame = normalizeMotionFrame(raw, prior, receivedAt);
    const sampleIdentity = motionSampleIdentity(raw, frame);
    if (sampleIdentity === this.lastSampleIdentity) {
      this.duplicateSampleCount += 1;
      return this.getState();
    }
    this.lastSampleIdentity = sampleIdentity;
    this.sampleCount += 1;
    if (frame.teleported) this.teleportCount += 1;

    const landed = Boolean(prior && !prior.onGround && frame.onGround && !frame.teleported);
    if (landed) this.landUntil = this.clockMs + this.options.landingDurationMs;

    const nextState = this.classify(frame, landed);
    this.changeState(nextState);

    // Render ticks may already have predicted part of this travelled distance.
    // Correct the prediction to the authoritative observed distance, so gait
    // phase follows blocks travelled without double counting network samples.
    if (frame.teleported) {
      this.predictedDistanceSinceSample = 0;
    } else if (prior && MOVING_STATES.has(this.state)) {
      const distanceCorrection = frame.horizontalDistance - this.predictedDistanceSinceSample;
      this.advanceGait(distanceCorrection, this.state);
      this.predictedDistanceSinceSample = 0;
    } else {
      this.predictedDistanceSinceSample = 0;
    }

    this.frame = frame;
    this.targetHorizontalSpeed = frame.teleported ? 0 : frame.horizontalSpeed;
    if (!this.anglesInitialized) {
      this.bodyYaw = frame.yaw;
      this.headYaw = frame.headYaw;
      this.pitch = frame.pitch;
      this.smoothedHorizontalSpeed = this.targetHorizontalSpeed;
      this.anglesInitialized = true;
    }
    return this.getState();
  }

  /**
   * Advance interpolation and gait prediction by a render-frame delta.
   * @param {number} deltaSeconds
   */
  update(deltaSeconds = 0) {
    const delta = clamp(finiteNumber(deltaSeconds, 0), 0, 0.25);
    this.clockMs = Math.max(this.clockMs + delta * 1_000, this.currentExternalTime());

    if (this.state === "land" && this.clockMs >= this.landUntil && this.frame) {
      this.changeState(this.classifyGroundLocomotion(this.frame));
    }

    const speedAlpha = dampingAlpha(this.options.speedDamping, delta);
    this.smoothedHorizontalSpeed += (this.targetHorizontalSpeed - this.smoothedHorizontalSpeed) * speedAlpha;
    if (MOVING_STATES.has(this.state) && !this.frame?.teleported) {
      const predictedDistance = Math.max(0, this.smoothedHorizontalSpeed) * (delta / TICK_SECONDS);
      this.advanceGait(predictedDistance, this.state);
      this.predictedDistanceSinceSample += predictedDistance;
    }

    if (this.frame && this.anglesInitialized) {
      this.bodyYaw = dampAngle(this.bodyYaw, this.frame.yaw, this.options.bodyYawDamping, delta);
      this.headYaw = dampAngle(this.headYaw, this.frame.headYaw, this.options.headYawDamping, delta);
      this.pitch += (this.frame.pitch - this.pitch) * dampingAlpha(this.options.pitchDamping, delta);
      this.pitch = clamp(this.pitch, -Math.PI / 2, Math.PI / 2);
    }
    return this.getState();
  }

  getState() {
    const headRelativeYaw = clamp(shortestAngle(this.bodyYaw, this.headYaw), -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT);
    return {
      state: this.state,
      previousState: this.previousState,
      stateAgeMs: Math.max(0, this.clockMs - this.stateChangedAt),
      gaitPhase: this.gaitPhase,
      horizontalSpeed: this.smoothedHorizontalSpeed,
      targetHorizontalSpeed: this.targetHorizontalSpeed,
      bodyYaw: this.bodyYaw,
      headYaw: this.headYaw,
      headRelativeYaw,
      pitch: this.pitch,
      frame: this.frame,
    };
  }

  getDiagnostics() {
    const state = this.getState();
    return {
      state: state.state,
      previousState: state.previousState,
      stateAgeMs: state.stateAgeMs,
      gaitPhase: state.gaitPhase,
      horizontalSpeed: state.horizontalSpeed,
      targetHorizontalSpeed: state.targetHorizontalSpeed,
      bodyYaw: state.bodyYaw,
      headYaw: state.headYaw,
      headRelativeYaw: state.headRelativeYaw,
      pitch: state.pitch,
      seq: this.frame?.seq ?? null,
      teleported: this.frame?.teleported ?? false,
      sampleCount: this.sampleCount,
      duplicateSampleCount: this.duplicateSampleCount,
      transitionCount: this.transitionCount,
      teleportCount: this.teleportCount,
    };
  }

  classify(frame, landed) {
    if (frame.riding) return "ride";
    if (frame.elytraFlying) return "fly";
    if (frame.inWater || frame.inLava) return "swim";
    if (!frame.onGround) {
      if (frame.verticalSpeed > this.options.verticalThreshold) return "jump";
      if (frame.verticalSpeed < -this.options.verticalThreshold) return "fall";
      return this.state === "jump" ? "jump" : "fall";
    }
    if (landed || (this.state === "land" && this.clockMs < this.landUntil)) return "land";
    return this.classifyGroundLocomotion(frame);
  }

  classifyGroundLocomotion(frame) {
    if (frame.teleported) return frame.sneaking ? "crouch" : "idle";
    const speed = Math.max(0, frame.horizontalSpeed);
    const wasMoving = this.state === "walk" || this.state === "run" || this.state === "crouchWalk";
    const movingThreshold = wasMoving ? this.options.walkExitSpeed : this.options.walkEnterSpeed;
    if (speed < movingThreshold) return frame.sneaking ? "crouch" : "idle";

    if (frame.sneaking) return "crouchWalk";
    const wasRunning = this.state === "run";
    const runningThreshold = wasRunning ? this.options.runExitSpeed : this.options.runEnterSpeed;
    const sprintRun = frame.sprinting && speed >= this.options.walkEnterSpeed;
    return speed >= runningThreshold || sprintRun ? "run" : "walk";
  }

  changeState(nextState) {
    const normalized = LOCOMOTION_STATES.includes(nextState) ? nextState : "idle";
    if (normalized === this.state) return;
    this.previousState = this.state;
    this.state = normalized;
    this.stateChangedAt = this.clockMs;
    this.transitionCount += 1;
  }

  advanceGait(distance, state) {
    if (!Number.isFinite(distance) || Math.abs(distance) < 1e-9) return;
    const stride = state === "run"
      ? this.options.runStrideBlocks
      : state === "swim" || state === "fly"
        ? this.options.swimStrideBlocks
        : this.options.walkStrideBlocks;
    this.gaitPhase = positiveModulo(this.gaitPhase + (distance / stride) * TWO_PI, TWO_PI);
  }

  syncClock() {
    this.clockMs = Math.max(this.clockMs, this.currentExternalTime());
  }

  currentExternalTime() {
    return finiteNumber(this.now(), this.clockMs ?? Date.now());
  }
}

/**
 * skinview3d-compatible animation driven by AvatarMotionGraph.
 *
 * It intentionally does not extend PlayerAnimation: minecraft-renderer only
 * requires an object with `.update(player, delta)`.  The duck-typed writer also
 * makes the class straightforward to test without WebGL or Three.js.
 */
export class PoseDrivenPlayerAnimation {
  /**
   * @param {{ now?: () => number, graph?: AvatarMotionGraph, graphOptions?: object,
   *   transitionDamping?: number, maxQueuedActions?: number }} [options]
   */
  constructor(options = {}) {
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.graph = options.graph instanceof AvatarMotionGraph
      ? options.graph
      : new AvatarMotionGraph({ ...(record(options.graphOptions)), now: this.now });
    this.transitionDamping = positiveNumber(options.transitionDamping, 14);
    this.maxQueuedActions = Math.round(clamp(finiteNumber(options.maxQueuedActions, 3), 0, 8));
    this.speed = 1;
    this.paused = false;
    this.progress = 0;
    this.clockMs = finiteNumber(this.now(), Date.now());
    this.upperAction = null;
    this.hurtAction = null;
    this.upperQueue = [];
    this.seenNonces = new Set();
    this.seenNonceOrder = [];
    this.stateWeights = new Map();
    this.player = null;
    this.defaults = null;
    this.availableBones = [];
    this.actionsTriggered = 0;
    this.actionsCompleted = 0;
    this.actionsDropped = 0;
  }

  setMotion(raw, receivedAt = this.currentExternalTime()) {
    return this.graph.setMotion(raw, receivedAt);
  }

  /**
   * Compatibility entry used by minecraft-renderer's WalkingGeneralSwing path.
   * @param {{ hand?: string, nonce?: string | number, durationMs?: number, at?: number }} [options]
   */
  swingArm(options = {}) {
    return this.trigger("swing", options);
  }

  /**
   * Trigger a one-shot overlay. Swing/use share an upper-body queue, while hurt
   * is a separate higher-priority reaction and may play over locomotion.
   *
   * @param {string | { kind?: string, type?: string, hand?: string, nonce?: string | number,
   *   durationMs?: number, at?: number }} action
   * @param {{ hand?: string, nonce?: string | number, durationMs?: number, at?: number }} [options]
   */
  trigger(action, options = {}) {
    this.syncClock();
    this.expireActions();
    const source = typeof action === "object" && action ? action : options;
    const rawKind = typeof action === "string" ? action : source.kind ?? source.type;
    const kind = normalizeActionKind(rawKind);
    if (!kind) return false;
    const nonceValue = source.nonce;
    const nonce = nonceValue === undefined || nonceValue === null ? null : String(nonceValue);
    if (nonce && this.seenNonces.has(nonce)) return false;
    if (nonce) this.rememberNonce(nonce);

    const created = {
      kind,
      hand: source.hand === "left" ? "left" : "right",
      nonce,
      createdAt: finiteNumber(source.at, this.clockMs),
      startedAt: this.clockMs,
      durationMs: clamp(
        finiteNumber(source.durationMs, DEFAULT_ACTION_DURATIONS[kind]),
        40,
        10_000,
      ),
    };
    this.actionsTriggered += 1;

    if (kind === "hurt") {
      this.hurtAction = created;
      return true;
    }
    if (!this.upperAction) {
      this.upperAction = created;
      return true;
    }
    if (this.upperQueue.length >= this.maxQueuedActions) {
      this.actionsDropped += 1;
      return false;
    }
    // Preserve action completion: a new arm action waits instead of resetting
    // the current swing halfway through its arc.
    this.upperQueue.push({ ...created, startedAt: null });
    return true;
  }

  /**
   * Compatible with minecraft-renderer's PlayerAnimation call site.
   * @param {unknown} player
   * @param {number} deltaSeconds
   */
  update(player, deltaSeconds = 0) {
    if (this.paused) return this.getDiagnostics();
    const delta = clamp(finiteNumber(deltaSeconds, 0) * positiveNumber(this.speed, 1), 0, 0.1);
    this.progress += delta;
    this.clockMs = Math.max(this.clockMs + delta * 1_000, this.currentExternalTime());
    const motion = this.graph.update(delta);
    this.expireActions();

    if (!player || typeof player !== "object") return this.getDiagnostics();
    this.ensureDefaults(player);
    if (!this.defaults) return this.getDiagnostics();
    restorePlayer(player, this.defaults);
    this.updateStateWeights(motion.state, delta);

    const pose = createPose();
    for (const [state, weight] of this.stateWeights) {
      if (weight > 1e-4) applyLocomotionPose(pose, state, weight, motion, this.progress);
    }
    applyLookPose(pose, motion);
    this.applyActionOverlays(pose, motion);
    applyPose(player, this.defaults, pose);
    return this.getDiagnostics();
  }

  getDiagnostics() {
    const motion = this.graph.getDiagnostics();
    return {
      ...motion,
      animationProgress: this.progress,
      paused: this.paused,
      speed: this.speed,
      stateWeights: Object.fromEntries(
        [...this.stateWeights].filter(([, weight]) => weight > 1e-4).map(([state, weight]) => [state, weight]),
      ),
      overlays: {
        upper: summarizeAction(this.upperAction, this.clockMs),
        hurt: summarizeAction(this.hurtAction, this.clockMs),
        queued: this.upperQueue.map((entry) => ({ kind: entry.kind, hand: entry.hand, nonce: entry.nonce })),
        usingHeldItem: this.graph.frame?.usingHeldItem ?? false,
      },
      playerCaptured: Boolean(this.defaults),
      availableBones: [...this.availableBones],
      actionsTriggered: this.actionsTriggered,
      actionsCompleted: this.actionsCompleted,
      actionsDropped: this.actionsDropped,
    };
  }

  ensureDefaults(player) {
    if (this.player === player && this.defaults) return;
    this.player = player;
    this.defaults = capturePlayer(player);
    this.availableBones = Object.entries(resolvePlayerNodes(player))
      .filter(([, node]) => Boolean(node))
      .map(([name]) => name);
    this.stateWeights.clear();
  }

  updateStateWeights(activeState, delta) {
    if (this.stateWeights.size === 0) {
      this.stateWeights.set(activeState, 1);
      return;
    }
    const alpha = dampingAlpha(this.transitionDamping, delta);
    for (const state of LOCOMOTION_STATES) {
      const current = this.stateWeights.get(state) ?? 0;
      const target = state === activeState ? 1 : 0;
      const next = current + (target - current) * alpha;
      if (next < 1e-4 && target === 0) this.stateWeights.delete(state);
      else this.stateWeights.set(state, next);
    }
  }

  applyActionOverlays(pose, motion) {
    const now = this.clockMs;
    const upper = this.upperAction;
    if (upper) {
      const progress = actionProgress(upper, now);
      if (upper.kind === "swing") applySwingOverlay(pose, progress, upper.hand);
      else if (upper.kind === "use") applyUseOverlay(pose, useEnvelope(progress), upper.hand, this.progress);
    } else if (motion.frame?.usingHeldItem) {
      applyUseOverlay(pose, 0.9, "right", this.progress);
    }
    if (this.hurtAction) applyHurtOverlay(pose, actionProgress(this.hurtAction, now));
  }

  expireActions() {
    const now = this.clockMs;
    if (this.hurtAction && actionProgress(this.hurtAction, now) >= 1) {
      this.hurtAction = null;
      this.actionsCompleted += 1;
    }
    if (this.upperAction && actionProgress(this.upperAction, now) >= 1) {
      this.upperAction = null;
      this.actionsCompleted += 1;
    }
    while (!this.upperAction && this.upperQueue.length > 0) {
      const next = this.upperQueue.shift();
      if (!next) break;
      if (now - next.createdAt > 1_500) {
        this.actionsDropped += 1;
        continue;
      }
      this.upperAction = { ...next, startedAt: now };
    }
  }

  rememberNonce(nonce) {
    this.seenNonces.add(nonce);
    this.seenNonceOrder.push(nonce);
    while (this.seenNonceOrder.length > 128) {
      const oldest = this.seenNonceOrder.shift();
      if (oldest !== undefined) this.seenNonces.delete(oldest);
    }
  }

  syncClock() {
    this.clockMs = Math.max(this.clockMs, this.currentExternalTime());
  }

  currentExternalTime() {
    return finiteNumber(this.now(), this.clockMs ?? Date.now());
  }
}

function applyLocomotionPose(pose, state, weight, motion, time) {
  const gait = motion.gaitPhase;
  const stride = Math.sin(gait);
  const lift = Math.abs(Math.sin(gait));
  const breathe = Math.sin(time * 1.8) * 0.025;

  if (state === "idle") {
    addPosition(pose, "body", 0, breathe, 0, weight);
    addRotation(pose, "leftArm", 0, 0, 0.025 + breathe * 0.2, weight);
    addRotation(pose, "rightArm", 0, 0, -0.025 - breathe * 0.2, weight);
    return;
  }
  if (state === "walk" || state === "run") {
    const running = state === "run";
    const legAmplitude = running ? 1.05 : 0.52;
    const armAmplitude = running ? 1.12 : 0.48;
    addRotation(pose, "leftLeg", stride * legAmplitude, 0, 0, weight);
    addRotation(pose, "rightLeg", -stride * legAmplitude, 0, 0, weight);
    addRotation(pose, "leftArm", -stride * armAmplitude, 0, running ? 0.18 : 0.06, weight);
    addRotation(pose, "rightArm", stride * armAmplitude, 0, running ? -0.18 : -0.06, weight);
    addPosition(pose, "body", 0, lift * (running ? 0.16 : 0.08), 0, weight);
    addRotation(pose, "root", 0, 0, running ? Math.cos(gait) * 0.012 : 0, weight);
    addRotation(pose, "cape", running ? 0.72 + Math.sin(gait * 2) * 0.08 : 0.2, 0, 0, weight);
    return;
  }
  if (state === "crouch" || state === "crouchWalk") {
    applyCrouchPose(pose, weight);
    if (state === "crouchWalk") {
      addRotation(pose, "leftLeg", stride * 0.34, 0, 0, weight);
      addRotation(pose, "rightLeg", -stride * 0.34, 0, 0, weight);
      addRotation(pose, "leftArm", -stride * 0.28, 0, 0, weight);
      addRotation(pose, "rightArm", stride * 0.28, 0, 0, weight);
      addPosition(pose, "body", 0, lift * 0.045, 0, weight);
    }
    return;
  }
  if (state === "jump") {
    addPosition(pose, "body", 0, 0.16, 0, weight);
    addRotation(pose, "leftArm", 0.45, 0, 0.12, weight);
    addRotation(pose, "rightArm", 0.45, 0, -0.12, weight);
    addRotation(pose, "leftLeg", -0.38, 0, 0.06, weight);
    addRotation(pose, "rightLeg", 0.18, 0, -0.06, weight);
    return;
  }
  if (state === "fall") {
    addRotation(pose, "leftArm", -0.18, 0, 0.48, weight);
    addRotation(pose, "rightArm", -0.18, 0, -0.48, weight);
    addRotation(pose, "leftLeg", 0.18, 0, 0.08, weight);
    addRotation(pose, "rightLeg", 0.06, 0, -0.08, weight);
    return;
  }
  if (state === "land") {
    const landingDuration = DEFAULT_GRAPH_OPTIONS.landingDurationMs;
    const landingProgress = clamp(motion.stateAgeMs / landingDuration, 0, 1);
    const compression = Math.sin(landingProgress * Math.PI);
    addPosition(pose, "body", 0, -0.48 * compression, 0.12 * compression, weight);
    addRotation(pose, "body", 0.18 * compression, 0, 0, weight);
    addRotation(pose, "leftLeg", 0.42 * compression, 0, 0, weight);
    addRotation(pose, "rightLeg", 0.42 * compression, 0, 0, weight);
    addRotation(pose, "leftArm", -0.22 * compression, 0, 0.1, weight);
    addRotation(pose, "rightArm", -0.22 * compression, 0, -0.1, weight);
    return;
  }
  if (state === "swim") {
    addRotation(pose, "root", -1.32, 0, 0, weight);
    addRotation(pose, "leftArm", Math.sin(gait) * 1.15 - 0.3, 0, 0.08, weight);
    addRotation(pose, "rightArm", Math.sin(gait + Math.PI) * 1.15 - 0.3, 0, -0.08, weight);
    addRotation(pose, "leftLeg", -stride * 0.25, 0, 0, weight);
    addRotation(pose, "rightLeg", stride * 0.25, 0, 0, weight);
    return;
  }
  if (state === "fly") {
    addRotation(pose, "root", -1.22, 0, 0, weight);
    addRotation(pose, "leftArm", 0.62, 0, 0.12, weight);
    addRotation(pose, "rightArm", 0.62, 0, -0.12, weight);
    addRotation(pose, "leftLeg", 0.16 + stride * 0.08, 0, 0, weight);
    addRotation(pose, "rightLeg", 0.16 - stride * 0.08, 0, 0, weight);
    addRotation(pose, "leftWing", -0.08, 0, 0.55, weight);
    addRotation(pose, "rightWing", -0.08, 0, -0.55, weight);
    return;
  }
  if (state === "ride") {
    addRotation(pose, "leftArm", -Math.PI / 5, 0, 0, weight);
    addRotation(pose, "rightArm", -Math.PI / 5, 0, 0, weight);
    addRotation(pose, "rightLeg", -1.4137167, -Math.PI / 10, -Math.PI / 40, weight);
    addRotation(pose, "leftLeg", -1.4137167, Math.PI / 10, Math.PI / 40, weight);
  }
}

function applyCrouchPose(pose, weight) {
  addRotation(pose, "body", 0.4537860552, 0, 0, weight);
  addPosition(pose, "body", 0, -2.103677462, -2.1244129377, weight);
  addPosition(pose, "head", 0, -3.618325234674, 0, weight);
  addPosition(pose, "leftArm", 0, -2.53943318, 0.168294196974, weight);
  addPosition(pose, "rightArm", 0, -2.53943318, 0.168294196974, weight);
  addRotation(pose, "leftArm", 0.410367746202, 0, 0.1, weight);
  addRotation(pose, "rightArm", 0.410367746202, 0, -0.1, weight);
  addPosition(pose, "leftLeg", 0, 0, -3.4500310377, weight);
  addPosition(pose, "rightLeg", 0, 0, -3.4500310377, weight);
  addPosition(pose, "cape", 0, -1.851236166577372, 0.3365883943, weight);
  addRotation(pose, "cape", 0.294220265771, 0, 0, weight);
}

function applyLookPose(pose, motion) {
  addRotation(pose, "head", -motion.pitch, motion.headRelativeYaw, 0, 1);
}

function applySwingOverlay(pose, progress, hand) {
  const arc = Math.sin(clamp(progress, 0, 1) * Math.PI);
  const strike = Math.sin(clamp(progress, 0, 1) * Math.PI * 0.92);
  const side = hand === "left" ? 1 : -1;
  const arm = hand === "left" ? "leftArm" : "rightArm";
  addRotation(pose, arm, -1.62 * strike, side * 0.08 * arc, side * 0.34 * arc, 1);
  addRotation(pose, "body", 0, -side * 0.12 * arc, 0, 1);
  addRotation(pose, "head", 0, side * 0.05 * arc, 0, 1);
}

function applyUseOverlay(pose, strength, hand, time) {
  const side = hand === "left" ? 1 : -1;
  const arm = hand === "left" ? "leftArm" : "rightArm";
  const pulse = Math.sin(time * 7) * 0.035;
  addRotation(pose, arm, -1.25 * strength + pulse, side * 0.24 * strength, side * 0.12 * strength, 1);
  addRotation(pose, "head", 0.08 * strength, -side * 0.04 * strength, 0, 1);
}

function applyHurtOverlay(pose, progress) {
  const recoil = Math.sin(clamp(progress, 0, 1) * Math.PI);
  const shake = Math.sin(progress * Math.PI * 5) * recoil;
  addRotation(pose, "root", -0.08 * recoil, 0, 0.1 * shake, 1);
  addRotation(pose, "body", -0.18 * recoil, 0, 0, 1);
  addRotation(pose, "leftArm", 0.18 * recoil, 0, 0.08 * recoil, 1);
  addRotation(pose, "rightArm", 0.18 * recoil, 0, -0.08 * recoil, 1);
}

function createPose() {
  return Object.fromEntries(
    ["root", "body", "head", "leftArm", "rightArm", "leftLeg", "rightLeg", "cape", "leftWing", "rightWing"]
      .map((name) => [name, { position: zeroVector(), rotation: zeroVector() }]),
  );
}

function addPosition(pose, name, x, y, z, weight) {
  const target = pose[name]?.position;
  if (!target) return;
  target.x += x * weight;
  target.y += y * weight;
  target.z += z * weight;
}

function addRotation(pose, name, x, y, z, weight) {
  const target = pose[name]?.rotation;
  if (!target) return;
  target.x += x * weight;
  target.y += y * weight;
  target.z += z * weight;
}

function resolvePlayerNodes(player) {
  const skin = record(player?.skin);
  const elytra = record(player?.elytra);
  return {
    root: player,
    body: skin.body,
    head: skin.head,
    leftArm: skin.leftArm,
    rightArm: skin.rightArm,
    leftLeg: skin.leftLeg,
    rightLeg: skin.rightLeg,
    cape: player?.cape,
    leftWing: elytra.leftWing,
    rightWing: elytra.rightWing,
  };
}

function capturePlayer(player) {
  const nodes = resolvePlayerNodes(player);
  const defaults = {};
  for (const [name, node] of Object.entries(nodes)) defaults[name] = captureNode(node);
  return defaults;
}

function captureNode(node) {
  if (!node || typeof node !== "object") return null;
  return {
    position: captureTriple(node.position),
    rotation: captureTriple(node.rotation),
    rotationOrder: typeof node.rotation?.order === "string" ? node.rotation.order : undefined,
  };
}

function captureTriple(value) {
  if (!value || typeof value !== "object") return null;
  return {
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    z: finiteNumber(value.z, 0),
  };
}

function restorePlayer(player, defaults) {
  const nodes = resolvePlayerNodes(player);
  for (const [name, node] of Object.entries(nodes)) {
    const base = defaults[name];
    if (!node || !base) continue;
    writeTriple(node.position, base.position);
    writeTriple(node.rotation, base.rotation, base.rotationOrder);
  }
}

function applyPose(player, defaults, pose) {
  const nodes = resolvePlayerNodes(player);
  for (const [name, node] of Object.entries(nodes)) {
    const base = defaults[name];
    const offset = pose[name];
    if (!node || !base || !offset) continue;
    if (base.position) writeTriple(node.position, addVectors(base.position, offset.position));
    if (base.rotation) writeTriple(node.rotation, addVectors(base.rotation, offset.rotation), base.rotationOrder);
  }
  const elytra = player?.elytra;
  if (typeof elytra?.updateRightWing === "function" && !defaults.rightWing) elytra.updateRightWing();
  else if (typeof elytra?.updateRightWingRotation === "function" && !defaults.rightWing) elytra.updateRightWingRotation();
}

function writeTriple(target, value, order) {
  if (!target || !value) return;
  if (typeof target.set === "function") {
    if (order !== undefined) target.set(value.x, value.y, value.z, order);
    else target.set(value.x, value.y, value.z);
    return;
  }
  target.x = value.x;
  target.y = value.y;
  target.z = value.z;
}

function normalizeGraphOptions(options) {
  const normalized = {};
  for (const [key, fallback] of Object.entries(DEFAULT_GRAPH_OPTIONS)) {
    normalized[key] = positiveNumber(options[key], fallback);
  }
  return normalized;
}

function normalizeActionKind(value) {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (["swing", "oneswing", "attack", "dig", "mine"].includes(candidate)) return "swing";
  if (["hurt", "damage", "hit"].includes(candidate)) return "hurt";
  if (["use", "useitem", "usinghelditem", "eat", "drink", "bow"].includes(candidate)) return "use";
  return null;
}

function actionProgress(action, now) {
  if (!action || !Number.isFinite(action.startedAt)) return 0;
  return clamp((now - action.startedAt) / action.durationMs, 0, 1);
}

function useEnvelope(progress) {
  const fadeIn = clamp(progress / 0.18, 0, 1);
  const fadeOut = clamp((1 - progress) / 0.18, 0, 1);
  return Math.sin(Math.min(fadeIn, fadeOut) * Math.PI / 2);
}

function summarizeAction(action, now) {
  if (!action) return null;
  return {
    kind: action.kind,
    hand: action.hand,
    nonce: action.nonce,
    progress: actionProgress(action, now),
    durationMs: action.durationMs,
  };
}

function elapsedBetween(previous, capturedAt, receivedAt) {
  if (!previous) return 0;
  const capturedDelta = capturedAt - finiteNumber(previous.capturedAt, capturedAt);
  if (capturedDelta > 0 && capturedDelta <= 60_000) return capturedDelta;
  const receivedDelta = receivedAt - finiteNumber(previous.receivedAt, receivedAt);
  return receivedDelta > 0 && receivedDelta <= 60_000 ? receivedDelta : 0;
}

function motionSampleIdentity(raw, frame) {
  const source = record(raw);
  const entity = record(source.entity);
  const explicitSeq = finiteInteger(source.seq) ?? finiteInteger(entity.seq);
  if (explicitSeq !== null) return `seq:${explicitSeq}`;

  // When the producer has no sequence number, captured time plus every field
  // that can affect pose or locomotion forms a stable retransmission key. Do
  // not include receivedAt or derived counters: those legitimately differ when
  // the same packet is delivered twice.
  return `pose:${JSON.stringify([
    frame.capturedAt,
    frame.position.x,
    frame.position.y,
    frame.position.z,
    frame.velocity.x,
    frame.velocity.y,
    frame.velocity.z,
    frame.yaw,
    frame.headYaw,
    frame.pitch,
    frame.onGround,
    frame.inWater,
    frame.inLava,
    frame.elytraFlying,
    frame.riding,
    frame.sneaking,
    frame.sprinting,
    frame.usingHeldItem,
  ])}`;
}

function dampingAlpha(rate, delta) {
  return delta <= 0 ? 0 : 1 - Math.exp(-Math.max(0, rate) * delta);
}

function dampAngle(current, target, rate, delta) {
  return normalizeAngle(current + shortestAngle(current, target) * dampingAlpha(rate, delta));
}

function shortestAngle(from, to) {
  return normalizeAngle(to - from);
}

function normalizeAngle(value) {
  const angle = positiveModulo(value + Math.PI, TWO_PI) - Math.PI;
  return angle === -Math.PI && value > 0 ? Math.PI : angle;
}

function angleValue(value, fallback) {
  return normalizeAngle(finiteNumber(value, fallback));
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = numericValue(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function finiteNumber(value, fallback) {
  const number = numericValue(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteInteger(value) {
  const number = numericValue(value);
  return Number.isSafeInteger(number) ? number : null;
}

function positiveNumber(value, fallback) {
  const number = numericValue(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function numericValue(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function booleanValue(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return false;
}

function vector(value) {
  if (!value || typeof value !== "object") return null;
  const x = numericValue(value.x);
  const y = numericValue(value.y);
  const z = numericValue(value.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
}

function cloneVector(value) {
  const candidate = vector(value);
  return candidate ? { ...candidate } : null;
}

function zeroVector() {
  return { x: 0, y: 0, z: 0 };
}

function subtractVector(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scaleVector(value, scale) {
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

function addVectors(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
