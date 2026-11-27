const gateAnchor = 'async processMessageQueue(e){if(this.isProcessingQueue||this.messageQueue.length===0)return;';
const frameAnchor = 'await new Promise(s=>{requestAnimationFrame(s)})';
const continueAnchor = 'requestAnimationFrame(async()=>{this.isProcessingQueue=!1,this.processMessageQueue("queue-delay")});return';

function replaceOnce(source, anchor, replacement, name) {
  if (source.split(anchor).length !== 2) throw Error(`VIEWER_QUEUE_${name}_ANCHOR_CHANGED`);
  return source.replace(anchor, replacement);
}

export function patchViewerQueueGate(source) {
  let patched = replaceOnce(source, gateAnchor, gateAnchor + 'this.isProcessingQueue=!0;', 'GATE');
  patched = replaceOnce(patched, frameAnchor,
    'await new Promise(s=>{let done=!1;const finish=()=>{if(done)return;done=!0,s()};requestAnimationFrame(finish),setTimeout(finish,50)})', 'FRAME');
  return replaceOnce(patched, continueAnchor,
    'setTimeout(async()=>{this.isProcessingQueue=!1,this.processMessageQueue("queue-delay")},16);return', 'CONTINUE');
}
