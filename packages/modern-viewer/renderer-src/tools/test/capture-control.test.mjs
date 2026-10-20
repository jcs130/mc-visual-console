import test from 'node:test';
import assert from 'node:assert/strict';
import { installCaptureControl } from '../../src/modern-viewer/capture-control.js';

test('ordinary viewers retain their rendering lifecycle', () => {
  const target = {};
  assert.equal(installCaptureControl({enabled:false, target, setRendering:()=>assert.fail()}), null);
  assert.equal(target.__mcCaptureControl, undefined);
});
test('dedicated capture pauses rendering without touching network state, and resumes once', () => {
  const target = {socketState:{seq:1}}, changes=[];
  const lifecycle = installCaptureControl({enabled:true, target, setRendering:value=>changes.push(value)});
  const api = target.__mcCaptureControl;
  assert.equal(api.schema, 'mc-viewer-capture/v1');
  assert.equal(api.setActive(false), false);
  target.socketState.seq = 2;
  api.setActive(false);
  assert.equal(api.setActive(true), true);
  assert.equal(target.socketState.seq, 2);
  assert.deepEqual(changes,[false,true]);
  assert.throws(()=>api.setActive('false'), /INVALID/);
  lifecycle.dispose(); lifecycle.dispose();
  assert.equal(target.__mcCaptureControl, undefined);
  assert.throws(()=>api.setActive(true), /INVALID/);
  assert.deepEqual(changes,[false,true,false]);
});
