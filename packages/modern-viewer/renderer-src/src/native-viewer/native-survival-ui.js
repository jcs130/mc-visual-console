const COLORS=['pink','blue','red','green','yellow','purple','white']
// Optional panels follow identity-validated received state, never the address,
// server brand, chat text, or a remembered content-profile label.
export function nativeExtensionSupport(presentation) {
  if (presentation?.available !== true) return { skills: false, mana: false }
  const value = presentation.skills
  const mana = Number.isFinite(value?.mana?.current) && value.mana.current >= 0
    && Number.isFinite(value?.mana?.max) && value.mana.max > 0
  const entries = [value?.skills, value?.abilities].some(rows => Array.isArray(rows)
    && rows.some(row => typeof row?.name === 'string' && row.name.trim()))
  return { skills: mana || entries || typeof value?.rpg?.available === 'boolean', mana }
}
export function createNativeSurvivalUi({document,translate=()=>null}={}) {
  const effects=document.getElementById('corti-effects'),boss=document.getElementById('corti-boss-bars')
  const style=document.createElement('style');style.textContent=`
    #corti-skills[hidden],[data-corti-mana-vital][hidden]{display:none!important}
    #corti-skills [data-rpg-summary]{max-width:340px;white-space:normal;overflow-wrap:anywhere;line-height:1.6;color:#e4f2e8;margin-bottom:6px}
    .native-effect-row{display:flex;align-items:center;gap:5px;margin:4px 0;font:11px/1.4 system-ui;color:#e5eee9}.native-effect-row img{position:static;inset:auto;width:18px;height:18px;image-rendering:pixelated}
    .native-boss-row{width:364px;margin:7px auto;color:white;text-align:center;font:12px/1.4 system-ui}.native-boss-track,.native-boss-progress,.native-boss-notches{height:10px;background-size:364px 10px;image-rendering:pixelated}.native-boss-track{position:relative;width:364px}.native-boss-progress,.native-boss-notches{position:absolute;left:0;top:0}.native-boss-notches{width:364px}
  `;document.head.append(style)
  let signature=null
  const setExtensions = value => {
    const support=nativeExtensionSupport(value),skills=document.getElementById('corti-skills'),mana=document.querySelector('[data-corti-mana-vital]')
    if(skills)skills.hidden=!support.skills
    if(mana)mana.hidden=!support.mana
  }
  const reset=()=>{signature=null;effects?.replaceChildren();boss?.replaceChildren();setExtensions(null)}
  const add=(parent,tag,className,text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;parent?.append(el);return el}
  return {reset,
    update(presentation,assets) {
      setExtensions(presentation)
      const key=JSON.stringify([presentation?.available,presentation?.playerUuid,presentation?.effects,presentation?.bossBars,assets?.urls?.size])
      if(key===signature)return;reset();signature=key;setExtensions(presentation)
      if(!presentation?.available)return
      if(Array.isArray(presentation.effects))for(const effect of presentation.effects.slice(0,32)) {
        if(!/^minecraft:[a-z_]+$/.test(effect?.name??'')||!Number.isInteger(effect.amplifier)||effect.amplifier<0||effect.amplifier>255||!Number.isInteger(effect.duration))continue
        const leaf=effect.name.slice(10),row=add(effects,'div','native-effect-row')
        const url=assets?.urls?.get(`assets/minecraft/textures/mob_effect/${leaf}.png`)
        if(url){const image=add(row,'img','');image.src=url;image.alt=translate(`effect.minecraft.${leaf}`)||effect.name}
        add(row,'span','',`${translate(`effect.minecraft.${leaf}`)||effect.name} ${effect.amplifier+1}`)
        row.title=effect.duration<0?'服务端效果时长：无限':`服务端最近时长：${effect.duration} tick（不是重新推测的倒计时）`
      }
      if(Array.isArray(presentation.bossBars))for(const bar of presentation.bossBars.slice(0,8)) {
        if(!COLORS.includes(bar?.color)||!Number.isFinite(bar.health)||bar.health<0||bar.health>1||![0,6,10,12,20].includes(bar.dividers))continue
        const row=add(boss,'div','native-boss-row'),title=add(row,'div','',typeof bar.title==='string'?bar.title.slice(0,200):'Boss')
        title.title=`服务端血条 · ${Math.round(bar.health*100)}%`
        const background=assets?.urls?.get(`assets/minecraft/textures/gui/sprites/boss_bar/${bar.color}_background.png`)
        const progress=assets?.urls?.get(`assets/minecraft/textures/gui/sprites/boss_bar/${bar.color}_progress.png`)
        if(!background||!progress){add(row,'small','',`${Math.round(bar.health*100)}% · 原版血条纹理未支持`);continue}
        const track=add(row,'div','native-boss-track');track.style.backgroundImage=`url("${background}")`
        const fill=add(track,'div','native-boss-progress');fill.style.width=`${Math.floor(bar.health*182)*2}px`;fill.style.backgroundImage=`url("${progress}")`
        if(bar.dividers){
          const url=assets.urls.get(`assets/minecraft/textures/gui/sprites/boss_bar/notched_${bar.dividers}_background.png`)
          const fillUrl=assets.urls.get(`assets/minecraft/textures/gui/sprites/boss_bar/notched_${bar.dividers}_progress.png`)
          if(url&&fillUrl){const notch=add(track,'div','native-boss-notches');notch.style.backgroundImage=`url("${url}")`;const active=add(track,'div','native-boss-progress');active.style.width=fill.style.width;active.style.backgroundImage=`url("${fillUrl}")`}
        }
      }
    },dispose(){reset();style.remove()}
  }
}
