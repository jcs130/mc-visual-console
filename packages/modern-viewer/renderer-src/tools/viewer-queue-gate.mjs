// The shipped renderer sets its queue lock AFTER awaiting rAF. Multiple worker
// callbacks can therefore each schedule an independent processor for one frame.
export function patchViewerQueueGate(source){const anchor='async processMessageQueue(e){if(this.isProcessingQueue||this.messageQueue.length===0)return;';if(source.split(anchor).length!==2)throw Error('VIEWER_QUEUE_GATE_ANCHOR_CHANGED');return source.replace(anchor,anchor+'this.isProcessingQueue=!0;');}
