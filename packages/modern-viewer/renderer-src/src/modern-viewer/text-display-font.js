import {unzipSync,strFromU8} from 'fflate';

/** Original bitmap providers first, then the client's Chinese/default Unihex provider. */
export class TextDisplayFont {
  constructor() {this.bitmaps=new Map();this.cache=new Map();this.hex='';this.offsets=new Uint32Array(0x110000);this.overrides=[];}
  addBitmap(provider,image,createCanvas=()=>document.createElement('canvas')) {
    const canvas=createCanvas();canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    const rows=provider.chars.map(row=>[...row]),columns=rows[0].length;
    const w=canvas.width/columns,h=canvas.height/rows.length,height=provider.height??8;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w>64||h>64)throw Error('font_bitmap_dimensions');
    for(let y=0;y<rows.length;y++)for(let x=0;x<columns;x++) {
      const character=rows[y][x];if(character==='\0'||this.bitmaps.has(character))continue;
      let right=-1;
      for(let col=0;col<w;col++)for(let row=0;row<h;row++)if(pixels[((y*h+row)*canvas.width+x*w+col)*4+3])right=Math.max(right,col);
      const mask=new Uint8Array((right+1)*h);
      for(let row=0;row<h;row++)for(let col=0;col<=right;col++)mask[row*(right+1)+col]=pixels[((y*h+row)*canvas.width+x*w+col)*4+3];
      this.bitmaps.set(character,{mask,width:right+1,height:h,resolution:h/height,top:7-provider.ascent,
        advance:Math.floor((right+1)*height/h+.5)+1,shadow:1});
    }
  }
  addHex(text,overrides=[]) {
    if(text.length>9_000_000)throw Error('font_hex_budget');
    this.hex=text;this.overrides=overrides;
    for(let start=0;start<text.length;) {
      let end=text.indexOf('\n',start);if(end<0)end=text.length;
      const colon=text.indexOf(':',start),code=Number.parseInt(text.slice(start,colon),16);
      if(colon>start&&colon<end&&code>=0&&code<=0x10ffff)this.offsets[code]=colon+1;
      start=end+1;
    }
  }
  glyph(character) {
    if(this.bitmaps.has(character))return this.bitmaps.get(character);
    if(this.cache.has(character))return this.cache.get(character);
    const code=character.codePointAt(0),start=this.offsets[code];if(!start)return null;
    let end=this.hex.indexOf('\n',start);if(end<0)end=this.hex.length;
    const raw=this.hex.slice(start,end).trim(),width=raw.length/4;
    if(![8,16,24,32].includes(width))return null;
    const rows=Array.from({length:16},(_,y)=>Number.parseInt(raw.slice(y*width/4,(y+1)*width/4),16)>>>0);
    const range=this.overrides.find(r=>code>=r.from.codePointAt(0)&&code<=r.to.codePointAt(0));
    let left=range?.left??width,right=range?.right??-1;
    if(!range)for(let y=0;y<16;y++)for(let x=0;x<width;x++)if((rows[y]>>>(width-1-x))&1){left=Math.min(left,x);right=Math.max(right,x);}
    if(left>right){left=0;right=width-1;}
    const cropped=right-left+1,mask=new Uint8Array(cropped*16);
    for(let y=0;y<16;y++)for(let x=left;x<=right;x++)if((rows[y]>>>(width-1-x))&1)mask[y*cropped+x-left]=255;
    const glyph={mask,width:cropped,height:16,resolution:2,top:0,advance:Math.floor(cropped/2)+1,shadow:.5};
    if(this.cache.size>=512)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(character,glyph);return glyph;
  }
  dispose() {this.bitmaps.clear();this.cache.clear();this.hex='';this.offsets=new Uint32Array(0);}
}

export async function loadTextDisplayFont({fetcher=fetch,createImage=()=>new Image()}={}) {
  const response=await fetcher('/text-display-font.json');if(!response.ok)throw Error('text_display_font_missing');
  const spec=await response.json();
  if(spec.schemaVersion!==1||spec.minecraftVersion!=='1.20.6'||spec.uniform!==false||spec.jp!==false
      ||!Array.isArray(spec.providers)||spec.providers.length>16)throw Error('text_display_font_version');
  const font=new TextDisplayFont();
  try {
    for(const provider of spec.providers) {
      if(provider.type==='space') {
        for(const [character,advance] of Object.entries(provider.advances))font.bitmaps.set(character,{mask:new Uint8Array(),width:0,height:0,resolution:1,top:0,advance,shadow:1});
      } else if(provider.type==='bitmap') {
        if(!/^\/textures\/1\.20\.6\/font\/[a-z_]+\.png$/.test(provider.url))throw Error('font_bitmap_path');
        const image=createImage();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('font_bitmap_missing'));image.src=provider.url;});
        font.addBitmap(provider,image);
      } else if(provider.type==='unihex') {
        if(provider.url!=='/fonts/1.20.6/unifont.zip'||!/^unifont_all_no_pua-[\d.]+\.hex$/.test(provider.entry))throw Error('font_hex_path');
        const file=await fetcher(provider.url);if(!file.ok)throw Error('font_hex_missing');
        const data=new Uint8Array(await file.arrayBuffer());if(data.length>2_000_000)throw Error('font_zip_budget');
        const entries=unzipSync(data,{filter:entry=>entry.name===provider.entry&&entry.originalSize<=9_000_000});
        if(!entries[provider.entry])throw Error('font_hex_entry');
        font.addHex(strFromU8(entries[provider.entry]),provider.size_overrides);
      } else throw Error('font_provider_unsupported');
    }
    return font;
  } catch(error) {font.dispose();throw error;}
}

export function textDisplayLayout(display,font) {
  const lines=[{glyphs:[],width:0}];
  for(const run of display.runs)for(const character of run.text) {
    if(character==='\n'){lines.push({glyphs:[],width:0});continue;}
    const glyph=font.glyph(character);if(!glyph)throw Error('font_glyph_unavailable');
    let line=lines.at(-1);
    if(line.width+glyph.advance>display.lineWidth&&line.glyphs.length){lines.push({glyphs:[],width:0});line=lines.at(-1);}
    line.glyphs.push({glyph,color:run.color,x:line.width});line.width+=glyph.advance;
  }
  if(lines.length>16)throw Error('text_line_budget');
  const width=Math.max(1,...lines.map(l=>l.width));if(width>1024)throw Error('text_width_budget');
  return {lines,width,height:lines.length*10,canvasWidth:(width+1)*2,canvasHeight:(lines.length*10+1)*2};
}

export function paintTextDisplay(canvas,display,font) {
  const layout=textDisplayLayout(display,font);canvas.width=layout.canvasWidth;canvas.height=layout.canvasHeight;
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
  const bg=display.flags&4?0x40000000:display.background;
  context.fillStyle=`rgba(${bg>>>16&255},${bg>>>8&255},${bg&255},${(bg>>>24)/255})`;
  context.fillRect(0,0,canvas.width,canvas.height);
  const paint=(entry,x,y,shadow)=>{
    const {glyph}=entry,hex=Number.parseInt(entry.color.slice(1),16),dim=shadow ? .25 : 1;
    const r=Math.floor((hex>>16&255)*dim),g=Math.floor((hex>>8&255)*dim),b=Math.floor((hex&255)*dim);
    context.fillStyle=`rgba(${r},${g},${b},${display.opacity/255})`;
    const step=2/glyph.resolution,offset=shadow?glyph.shadow*2:0;
    for(let row=0;row<glyph.height;row++)for(let col=0;col<glyph.width;col++)if(glyph.mask[row*glyph.width+col])
      context.fillRect(x+col*step+offset,y+(glyph.top+row/glyph.resolution)*2+offset,step,step);
  };
  for(let index=0;index<layout.lines.length;index++) {
    const line=layout.lines[index],left=display.flags&8?0:display.flags&16?layout.width-line.width:(layout.width-line.width)/2;
    if(display.flags&1)for(const entry of line.glyphs)paint(entry,(1+left+entry.x)*2,2+index*20,true);
    for(const entry of line.glyphs)paint(entry,(1+left+entry.x)*2,2+index*20,false);
  }
  return layout;
}
