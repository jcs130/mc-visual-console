import { CAMERA_PROTOCOL } from './broadcast-camera.mjs';
import { NATIVE_CAMERA_RECIPES, nativeShotReceipt } from '../../../../tools/native-client-director/shot-policy.mjs';
export { NATIVE_CAMERA_RECIPES } from '../../../../tools/native-client-director/shot-policy.mjs';

/** Runtime view IDs, not a list of features magically granted to an old client. */
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sameScope = (n, op) => `${n.connectionEpoch}:${n.nativeWorldEpoch}` === op.scope;

/** All IO is explicitly supplied by the host; importing never scans files, ports or starts a client. */
export function createNativeCameraAdapter({ readNative, writeRequest, writeCancel,
  expectedServer, observerUuid, targetUuid, targetName, now = Date.now, maxAgeMs = 3000 }) {
  if (typeof readNative !== 'function' || typeof writeRequest !== 'function' || typeof expectedServer !== 'string'
    || !expectedServer || typeof observerUuid !== 'string' || !observerUuid || typeof targetUuid !== 'string' || !targetUuid
    || typeof targetName !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(targetName)) fail('INVALID_NATIVE_CAMERA_BINDING');
  let operation = null;
  async function read() {
    const n = await readNative(), at = Date.parse(n?.recordedAt);
    if (n?.schema !== 'mcvisual-native-director/v1' || n.server !== expectedServer || n.observerUuid !== observerUuid
      || n.connected !== true || n.authenticated !== true || n.connectionBoundRequests !== true
      || typeof n.connectionEpoch !== 'string' || !n.connectionEpoch || !Number.isInteger(n.nativeWorldEpoch) || n.nativeWorldEpoch < 1
      || !Number.isFinite(at) || at > now() || now() - at > maxAgeMs) fail('NATIVE_CAMERA_CONTEXT_UNAVAILABLE');
    if (!n.targets?.some(x => x.name === targetName && x.uuid === targetUuid)) fail('NATIVE_TARGET_IDENTITY_MISMATCH');
    return n;
  }
  const adapter = {
    async observe() {
      const n = await read(), manual = n.manualDetachRequested === true || n.phase === 'paused';
      const available = Array.isArray(n.availableViews) ? n.availableViews : [];
      const shots = Object.entries(NATIVE_CAMERA_RECIPES).map(([id, recipe]) => ({ id, ...recipe,
        available: available.includes(id) && !manual && !['unknown', 'stopped'].includes(n.phase),
        projection: 'perspective', preflightRequired: recipe.finite }));
      const observed = { schema: CAMERA_PROTOCOL, at: Date.parse(n.recordedAt), scope: `${n.connectionEpoch}:${n.nativeWorldEpoch}`,
        subjectUuid: targetUuid, manualControl: manual, shots, nativePhase: n.phase, effectiveView: n.effectiveView,
        shotExecution: n.shotExecution, closeView: n.closeView };
      if (!operation || !sameScope(n, operation)) return observed;
      const receipt = { actionId: operation.actionId, lease: operation.lease, phase: 'transitioning', projection: 'perspective',
        requestedView: operation.shot, effectiveView: n.effectiveView, nativePhase: n.phase, rendered: false };
      const cancel = n.cancelReceipt;
      if (cancel?.id === operation.actionId && cancel.lease === operation.lease && cancel.connectionEpoch === n.connectionEpoch
        && cancel.nativeWorldEpoch === n.nativeWorldEpoch && cancel.targetUuid === targetUuid && ['cancelled', 'unknown'].includes(cancel.phase)) {
        receipt.phase = cancel.phase; observed.receipt = receipt; return observed;
      }
      if (n.requestId !== operation.actionId || n.activeLease !== operation.lease) return observed;
      const outcome = nativeShotReceipt(n, { id: operation.actionId, lease: operation.lease, view: operation.shot,
        targetUuid, connectionEpoch: n.connectionEpoch, issuedAt: operation.issuedAt }, now(), { maxAgeMs });
      receipt.reason = outcome.reason;
      if (['applied', 'rejected', 'unknown', 'cancelled'].includes(outcome.kind)) receipt.phase = outcome.kind;
      receipt.rendered = outcome.kind === 'applied';
      if (n.shotExecution?.requestId === operation.actionId) receipt.execution = structuredClone(n.shotExecution);
      observed.receipt = receipt; return observed;
    },
    async submit(op, { signal }) {
      operation = structuredClone(op); const n = await read();
      if (signal?.aborted) fail('NATIVE_CAMERA_SUBMIT_ABORTED');
      if (!sameScope(n, op) || op.subjectUuid !== targetUuid || !NATIVE_CAMERA_RECIPES[op.shot]
        || !n.availableViews?.includes(op.shot) || n.manualDetachRequested || ['unknown', 'stopped', 'paused'].includes(n.phase)) fail('NATIVE_CAMERA_EXECUTION_GUARD');
      await writeRequest({ id: op.actionId, lease: op.lease, target: targetName, view: op.shot,
        issuedAt: op.issuedAt, expiresAt: op.expiresAt, connectionEpoch: n.connectionEpoch }, { signal });
    },
  };
  if (typeof writeCancel === 'function') adapter.cancel = async op => {
    operation = structuredClone(op); const n = await read();
    if (!sameScope(n, op) || n.rigCancelSupported !== true) fail('NATIVE_CANCEL_UNAVAILABLE');
    await writeCancel({ id: op.actionId, lease: op.lease, target: targetName, targetUuid,
      connectionEpoch: n.connectionEpoch, issuedAt: now(), expiresAt: now() + 10000 });
  };
  return adapter;
}
