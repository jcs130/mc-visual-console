/** Await decoded skins and reject responses for a superseded profile or entity. */
export function patchRendererPlayerSkin(source) {
  const replacements = [
    ['let t=await(await fetch(n,{})).arrayBuffer();return`data:image/png;base64,${O.from(t).toString("base64")}`',
      'let r=await fetch(n,{});if(!r.ok)throw Error("SKIN_TEXTURE_UNAVAILABLE_HTTP_"+r.status);if(!(r.headers.get("content-type")??"").toLowerCase().split(";")[0].trim().match(/^image\\/png$/))throw Error("SKIN_TEXTURE_CONTENT_TYPE");let t=await r.arrayBuffer();if(t.byteLength<24||t.byteLength>65536||![137,80,78,71,13,10,26,10].every((v,i)=>new Uint8Array(t)[i]===v))throw Error("SKIN_TEXTURE_FORMAT");return`data:image/png;base64,${O.from(t).toString("base64")}`'],
    ['this.loadAndApplySkin(e,i,a).then(async()=>{', 'await this.loadAndApplySkin(e,i,a).then(async()=>{'],
    ['o.magFilter=j.NearestFilter,o.minFilter=j.NearestFilter,o.needsUpdate=!0,i.skin.map=o',
      'if(this.getPlayerObject(e)!==i||this.currentSkinUrls[String(e)]&&this.currentSkinUrls[String(e)]!==t){o.dispose();return}o.magFilter=j.NearestFilter,o.minFilter=j.NearestFilter,o.needsUpdate=!0,i.skin.map=o'],
  ];
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw Error('minecraft-renderer player skin anchor changed');
    source = source.replace(before, after);
  }
  return source;
}
