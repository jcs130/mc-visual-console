import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRelay} from './viewer-performance-relay.mjs';
const response=()=>Object.assign(new EventEmitter(),{headersSent:false,destroyed:false,code:0,body:'',
  writeHead(code){this.code=code;this.headersSent=true;return this;},end(text=''){this.body=text;return this;}});
test('only probes the configured origin on demand and binds it to the same source identity',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));return new Response(JSON.stringify({sourceId:'another-bot'}));};
  const relay=createRelay({endpoint:'http://performance.invalid:8107',sourceId:'my-bot'});
  try {
    assert.equal(calls.length,0);
    assert.equal(await relay.handle({headers:{}},response(),'/unrelated'),false);
    assert.equal(calls.length,0);
    const res=response();await relay.handle({headers:{}},res,'/speech-source');
    assert.deepEqual(calls,['http://performance.invalid:8107/identity']);
    assert.deepEqual(JSON.parse(res.body),{available:false,sourceId:'my-bot'});
    const overlay=response();await relay.handle({headers:{}},overlay,'/overlay');assert.equal(overlay.code,503);
    assert.equal(calls.length,1);
    relay.close();await relay.handle({headers:{}},response(),'/speech-source');assert.equal(calls.length,1);
  }finally{relay.close();globalThis.fetch=original;}
});
test('closing the relay aborts its pending identity request and never starts proxying a late match',async()=>{
  const original=globalThis.fetch;let signal,resolve;
  globalThis.fetch=(_url,options)=>{signal=options.signal;return new Promise(r=>{resolve=r;});};
  const relay=createRelay({endpoint:'http://performance.invalid',sourceId:'my-bot'});
  try {
    const res=response(),pending=relay.handle({headers:{}},res,'/overlay');
    relay.close();assert.equal(signal.aborted,true);resolve(new Response(JSON.stringify({sourceId:'my-bot'})));
    await pending;assert.equal(res.code,503);
    assert.throws(()=>createRelay({endpoint:'http://name:password@example.test',sourceId:'bot'}));
    assert.throws(()=>createRelay({endpoint:'http://example.test/path',sourceId:'bot'}));
  }finally{relay.close();globalThis.fetch=original;}
});
