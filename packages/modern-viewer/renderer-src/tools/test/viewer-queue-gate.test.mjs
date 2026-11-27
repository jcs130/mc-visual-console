import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchViewerQueueGate } from '../viewer-queue-gate.mjs';

const rendererQueue = `class Queue {
  constructor() {
    this.isProcessingQueue = false;
    this.messageQueue = [1, 2, 3];
    this.handled = [];
    this.lastRendered = 1;
    this.ONMESSAGE_TIME_LIMIT = 1;
    this.worldRendererConfig = { _experimentalSmoothChunkLoading: true };
    this.renderingActive = true;
    this.stopMesherMessagesProcessing = false;
  }
  logWorkerWork() {}
  handleMessage(message) { this.handled.push(message); }
  async processMessageQueue(e){if(this.isProcessingQueue||this.messageQueue.length===0)return;if(this.logWorkerWork(\`# \${e} processing queue\`),this.lastRendered&&performance.now()-this.lastRendered>this.ONMESSAGE_TIME_LIMIT&&this.worldRendererConfig._experimentalSmoothChunkLoading&&this.renderingActive){let i=performance.now();await new Promise(s=>{requestAnimationFrame(s)}),this.logWorkerWork(\`# processing got delayed by \${performance.now()-i}ms\`)}this.isProcessingQueue=!0;let t=performance.now(),r=0;for(;this.messageQueue.length>0;){let i=this.stopMesherMessagesProcessing;if(!i){let s=this.messageQueue.shift();this.handleMessage(s),r++}if(i||performance.now()-t>this.ONMESSAGE_TIME_LIMIT&&this.renderingActive&&this.worldRendererConfig._experimentalSmoothChunkLoading){if(this.messageQueue.length>0){requestAnimationFrame(async()=>{this.isProcessingQueue=!1,this.processMessageQueue("queue-delay")});return}break}}this.isProcessingQueue=!1}
}`;

test('viewer queue drains when animation frames never fire', async () => {
  const timers = [];
  let now = 100;
  const context = {
    performance: { now: () => now },
    requestAnimationFrame: () => 1,
    setTimeout: callback => { timers.push(callback); return timers.length; },
  };
  vm.runInNewContext(patchViewerQueueGate(rendererQueue) + '\nglobalThis.queue = new Queue();', context);
  const draining = context.queue.processMessageQueue('test');
  assert.equal(context.queue.isProcessingQueue, true);
  assert.deepEqual(Array.from(context.queue.handled), []);

  for (let rounds = 0; timers.length && rounds < 10; rounds++) {
    const batch = timers.splice(0);
    for (const callback of batch) callback();
    await Promise.resolve();
    now += 2;
  }
  await draining;

  assert.deepEqual(Array.from(context.queue.handled), [1, 2, 3]);
  assert.deepEqual(Array.from(context.queue.messageQueue), []);
  assert.equal(context.queue.isProcessingQueue, false);
  assert.equal(timers.length, 0);
});

test('queue patch rejects changed renderer anchors', () => {
  assert.throws(() => patchViewerQueueGate('changed'), /VIEWER_QUEUE_GATE_ANCHOR_CHANGED/);
});
