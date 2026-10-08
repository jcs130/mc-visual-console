/** Await decoded skins and reject responses for a superseded profile or entity. */
export function patchRendererPlayerSkin(source) {
  const replacements = [
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
