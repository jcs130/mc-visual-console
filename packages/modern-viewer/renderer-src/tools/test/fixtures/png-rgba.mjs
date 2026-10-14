import { inflateSync } from 'node:zlib'

// Offline original-asset tests only; PNG's noninterlaced RGB/RGBA/indexed
// scanline filters. Production uses the browser's actual PNG decoder.
export function pngRgba(input) {
  const png=Buffer.from(input)
  if(png.readUInt32BE(0)!==0x89504e47||png.readUInt32BE(4)!==0x0d0a1a0a)throw Error('TEST_PNG_SIGNATURE')
  let width,height,type,depth,palette,alpha;const chunks=[]
  for(let offset=8;offset+12<=png.length;) {
    const size=png.readUInt32BE(offset),name=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size)
    if(data.length!==size)throw Error('TEST_PNG_CHUNK')
    if(name==='IHDR') {
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);type=data[9];depth=data[8]
      if(![2,3,6].includes(type)||(type===3?![1,2,4,8].includes(depth):depth!==8)||data[10]!==0||data[11]!==0||data[12]!==0||width*height>262144)throw Error('TEST_PNG_FORMAT')
    }else if(name==='PLTE')palette=data
    else if(name==='tRNS')alpha=data
    else if(name==='IDAT')chunks.push(data)
    else if(name==='IEND')break
    offset+=size+12
  }
  const channels=type===6?4:type===2?3:1,rowBytes=Math.ceil(width*channels*depth/8),raw=inflateSync(Buffer.concat(chunks)),decoded=Buffer.alloc(rowBytes*height)
  if(raw.length!==(rowBytes+1)*height)throw Error('TEST_PNG_LENGTH')
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c}
  for(let y=0;y<height;y++) {
    const filter=raw[y*(rowBytes+1)]
    if(filter>4)throw Error('TEST_PNG_FILTER')
    for(let x=0;x<rowBytes;x++) {
      const index=y*rowBytes+x,a=x>=channels?decoded[index-channels]:0,b=y?decoded[index-rowBytes]:0,c=y&&x>=channels?decoded[index-rowBytes-channels]:0
      const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)
      decoded[index]=(raw[y*(rowBytes+1)+1+x]+predictor)&255
    }
  }
  const pixels=new Uint8Array(width*height*4)
  for(let n=0;n<width*height;n++) {
    if(type===3){const bit=n%width*depth,index=(decoded[Math.floor(n/width)*rowBytes+Math.floor(bit/8)]>>(8-depth-bit%8))&((1<<depth)-1);if(!palette||index*3+2>=palette.length)throw Error('TEST_PNG_PALETTE');pixels.set(palette.subarray(index*3,index*3+3),n*4);pixels[n*4+3]=alpha?.[index]??255}
    else {pixels.set(decoded.subarray(n*channels,n*channels+3),n*4);pixels[n*4+3]=type===6?decoded[n*channels+3]:255}
  }
  return {width,height,pixels}
}
