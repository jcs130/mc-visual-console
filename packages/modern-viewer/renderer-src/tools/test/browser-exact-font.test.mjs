import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadTextDisplayFont} from '../../src/modern-viewer/text-display-font.js';
const require=createRequire(new URL('../../../../../package.json',import.meta.url));
const {Image,createCanvas}=require('canvas');

test('browser loads original bitmap and Chinese glyphs from the exact 1.21.11 font pack',async()=>{
  const root=fileURLToPath(new URL('../../../asset-packs/java-1.21.11/public/',import.meta.url));
  const previous=globalThis.document;globalThis.document={createElement:()=>createCanvas(1,1)};
  const fetcher=async url=>new Response(readFileSync(path.join(root,url.slice(1))));
  const createImage=()=>{
    const image=new Image(),descriptor=Object.getOwnPropertyDescriptor(Image.prototype,'src');
    Object.defineProperty(image,'src',{set(url){descriptor.set.call(image,readFileSync(path.join(root,url.slice(1))));}});
    return image;
  };
  let font;
  try{
    font=await loadTextDisplayFont({fetcher,createImage,minecraftVersion:'1.21.11'});
    assert.ok(font.glyph('A')?.mask.some(value=>value));
    assert.ok(font.glyph('萌')?.mask.some(value=>value));
    assert.ok(font.glyph('▼')?.mask.some(value=>value));
    await assert.rejects(loadTextDisplayFont({fetcher,createImage,minecraftVersion:'1.21.1'}),/font_version/);
    await assert.rejects(loadTextDisplayFont({fetcher,createImage,minecraftVersion:'../1.21.11'}),/font_version/);
  }finally{font?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
