import {activityText} from '../src/modern-viewer/agent-activity.js';
/** Explicit public model note, not raw reasoning. Polling cannot renew its age. */
export function publicThoughtView(note,now=Date.now()){
 if(!note||note.source!=='model-public-note'||note.verification!=='intention-not-outcome'
  ||!Number.isFinite(Date.parse(note.at))||Date.parse(note.at)>now||now-Date.parse(note.at)>=120000
  ||typeof note.text!=='string'||typeof note.next!=='string'||!note.text.trim()||!note.next.trim()
  ||note.text.length>160||note.next.length>100)return null;
 if(/[\r\n<>]|https?:|[A-Z]:[\\/]|\b(?:Bearer|sk-|AIza)|\/(?:login|register)\b|(?:password|api[_-]?key|token|secret)\s*[:=]|分身|执行者|主人格|worker|assignment/i.test(note.text+' '+note.next))return null;
 return {text:activityText(note.text,160),next:activityText(note.next,100),at:note.at,source:note.source,verification:note.verification};
}
