import { PoseDrivenPlayerAnimation } from "./avatar-motion.js";

const DEFAULT_RIG_TYPE = "minecraft-player";
const RIG_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const MAX_RIG_KEY_LENGTH = 256;

/**
 * Local registry for replaceable avatar rig adapters.
 *
 * The registry does not interpret model URLs, chat text or server-provided
 * factory code. Adapter factories are registered directly by trusted local
 * JavaScript. At present only `minecraft-player` is built in; GLTF/VRM can be
 * added later by registering local factories without changing this class.
 */
export class AvatarRigRegistry {
  /**
   * @param {{ animationOptions?: object }} [options]
   */
  constructor(options = {}) {
    this.animationOptions = { ...record(options.animationOptions) };
    this.factories = new Map();
    this.entries = new Map();
    this.bindingSerial = 0;
    this.rebindCount = 0;
    this.removeCount = 0;
    this.lastDisposeError = null;

    this.factories.set(DEFAULT_RIG_TYPE, (context) => createMinecraftPlayerRig({
      ...context,
      animationOptions: {
        ...this.animationOptions,
        ...record(context.options.animationOptions),
      },
    }));
  }

  /**
   * Register a trusted local adapter factory.
   *
   * A factory is synchronous and receives `{ key, type, model, options }`. It
   * must return an object implementing setMotion, trigger and getDiagnostics;
   * dispose is optional. Asynchronous asset loading can remain internal to a
   * future adapter controller.
   *
   * @param {string} type
   * @param {(context: { key: string, type: string, model: object, options: object }) => object} factory
   * @param {{ replace?: boolean }} [options]
   */
  register(type, factory, options = {}) {
    const normalizedType = normalizeRigType(type);
    if (typeof factory !== "function") throw new TypeError("Avatar rig factory must be a function");
    const existing = this.factories.get(normalizedType);
    if (normalizedType === DEFAULT_RIG_TYPE && existing) {
      throw new Error("The built-in minecraft-player rig factory cannot be replaced");
    }
    if (existing && options.replace !== true) {
      throw new Error(`Avatar rig type is already registered: ${normalizedType}`);
    }
    this.factories.set(normalizedType, factory);
    return this;
  }

  /**
   * Ensure one rig binding exists for `key` and `model`.
   *
   * Calling ensure repeatedly with the same key, type and exact model object
   * returns the existing rig. A new model object or rig type creates a fresh
   * adapter, disposes the previous binding and atomically replaces the entry.
   *
   * @param {string | number} key
   * @param {object} model
   * @param {{ type?: string, animationOptions?: object, [key: string]: unknown }} [options]
   */
  ensure(key, model, options = {}) {
    const normalizedKey = normalizeRigKey(key);
    const normalizedType = normalizeRigType(options.type ?? DEFAULT_RIG_TYPE);
    if (!model || typeof model !== "object") throw new TypeError("Avatar rig model must be an object");
    const factory = this.factories.get(normalizedType);
    if (!factory) throw new Error(`Avatar rig type is not registered: ${normalizedType}`);

    const existing = this.entries.get(normalizedKey);
    if (existing && existing.type === normalizedType && existing.model === model) return existing.rig;

    const context = {
      key: normalizedKey,
      type: normalizedType,
      model,
      options: { ...record(options), type: normalizedType },
    };
    const rig = factory(context);
    validateRig(rig, normalizedType);

    const nextEntry = {
      key: normalizedKey,
      type: normalizedType,
      model,
      rig,
      bindingId: ++this.bindingSerial,
    };
    if (existing) {
      this.rebindCount += 1;
      this.disposeEntry(existing);
    }
    this.entries.set(normalizedKey, nextEntry);
    return rig;
  }

  /** @param {string | number} key */
  get(key) {
    const normalizedKey = normalizeRigKey(key);
    return this.entries.get(normalizedKey)?.rig ?? null;
  }

  /**
   * Forward a motion sample to an existing rig.
   * @param {string | number} key
   * @param {unknown} raw
   * @param {number} [receivedAt]
   */
  setMotion(key, raw, receivedAt) {
    const rig = this.get(key);
    if (!rig) return null;
    return rig.setMotion(raw, receivedAt);
  }

  /**
   * Forward a semantic one-shot action to an existing rig.
   * @param {string | number} key
   * @param {unknown} action
   * @param {object} [options]
   */
  trigger(key, action, options) {
    const rig = this.get(key);
    if (!rig) return false;
    return rig.trigger(action, options);
  }

  /** @param {string | number} key */
  remove(key) {
    const normalizedKey = normalizeRigKey(key);
    const entry = this.entries.get(normalizedKey);
    if (!entry) return false;
    this.entries.delete(normalizedKey);
    this.disposeEntry(entry);
    this.removeCount += 1;
    return true;
  }

  /**
   * With a key, return diagnostics for one binding. Without a key, return a
   * bounded registry summary. Only actually registered types are advertised.
   *
   * @param {string | number} [key]
   */
  getDiagnostics(key) {
    if (key !== undefined) {
      const normalizedKey = normalizeRigKey(key);
      const entry = this.entries.get(normalizedKey);
      return entry ? entryDiagnostics(entry) : null;
    }
    return {
      registeredTypes: [...this.factories.keys()].sort(),
      instanceCount: this.entries.size,
      bindingSerial: this.bindingSerial,
      rebindCount: this.rebindCount,
      removeCount: this.removeCount,
      lastDisposeError: this.lastDisposeError,
      bindings: [...this.entries.values()]
        .map((entry) => ({
          key: entry.key,
          type: entry.type,
          bindingId: entry.bindingId,
          installed: installedState(entry.rig),
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
  }

  disposeEntry(entry) {
    try {
      entry.rig.dispose?.();
    } catch (error) {
      // A faulty optional adapter must not prevent a newer binding from being
      // installed or leave the registry entry undeletable.
      this.lastDisposeError = safeErrorMessage(error);
    }
  }
}

function createMinecraftPlayerRig(context) {
  const model = context.model;
  const hadOwnAnimation = Object.prototype.hasOwnProperty.call(model, "animation");
  const previousAnimation = model.animation;
  const animation = new PoseDrivenPlayerAnimation(context.animationOptions);
  let disposed = false;
  model.animation = animation;

  return {
    type: DEFAULT_RIG_TYPE,
    key: context.key,
    model,
    animation,
    setMotion(raw, receivedAt) {
      if (disposed) return null;
      return animation.setMotion(raw, receivedAt);
    },
    trigger(action, options) {
      if (disposed) return false;
      return animation.trigger(action, options);
    },
    getDiagnostics() {
      return {
        adapter: DEFAULT_RIG_TYPE,
        key: context.key,
        disposed,
        installed: !disposed && model.animation === animation,
        animation: animation.getDiagnostics(),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Do not overwrite a newer animation installed by another local system.
      if (model.animation !== animation) return;
      if (hadOwnAnimation) model.animation = previousAnimation;
      else delete model.animation;
    },
  };
}

function validateRig(rig, type) {
  if (!rig || typeof rig !== "object" || isPromiseLike(rig)) {
    throw new TypeError(`Avatar rig factory ${type} must return a synchronous rig object`);
  }
  for (const method of ["setMotion", "trigger", "getDiagnostics"]) {
    if (typeof rig[method] !== "function") {
      try {
        rig.dispose?.();
      } catch {
        // Validation error below remains the useful failure.
      }
      throw new TypeError(`Avatar rig factory ${type} returned a rig without ${method}()`);
    }
  }
  if (rig.dispose !== undefined && typeof rig.dispose !== "function") {
    throw new TypeError(`Avatar rig factory ${type} returned a non-function dispose property`);
  }
}

function entryDiagnostics(entry) {
  let adapterDiagnostics;
  try {
    adapterDiagnostics = entry.rig.getDiagnostics();
  } catch (error) {
    adapterDiagnostics = { diagnosticsError: safeErrorMessage(error) };
  }
  return {
    key: entry.key,
    type: entry.type,
    bindingId: entry.bindingId,
    installed: installedState(entry.rig),
    adapter: adapterDiagnostics,
  };
}

function installedState(rig) {
  if (rig?.type !== DEFAULT_RIG_TYPE) return null;
  return rig.model?.animation === rig.animation;
}

function normalizeRigKey(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError("Avatar rig key must be a string or number");
  }
  const key = String(value).trim();
  if (!key || key.length > MAX_RIG_KEY_LENGTH) throw new RangeError("Avatar rig key is empty or too long");
  return key;
}

function normalizeRigType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  if (!RIG_TYPE_PATTERN.test(type)) throw new RangeError(`Invalid avatar rig type: ${type || "(empty)"}`);
  return type;
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

function safeErrorMessage(error) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
