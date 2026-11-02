import type {ContentPanel} from './client-content-stream.mjs';
export function agentActivityPanels(options?:{name?:string;records?:unknown[];phase?:{text:string;paused?:boolean}|null;now?:number}):ContentPanel[];
