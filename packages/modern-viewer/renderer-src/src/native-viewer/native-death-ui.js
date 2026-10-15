// Same-player presentation only: no game actions, respawn button or model call.
export function createNativeDeathUi({document, now=()=>Date.now()}={}) {
  const panel=document.createElement('section'),title=document.createElement('strong'),detail=document.createElement('p'),style=document.createElement('style')
  panel.className='native-death-scene';panel.hidden=true;panel.setAttribute('role','status');panel.setAttribute('aria-live','polite')
  panel.append(title,detail);document.body.append(panel)
  style.textContent=`.native-death-scene[hidden]{display:none}.native-death-scene{position:fixed;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:radial-gradient(ellipse,transparent 12%,#53000ba8 100%);color:#fff;text-shadow:0 2px 5px #000;animation:native-death-in .35s ease-out}.native-death-scene strong{font:700 clamp(24px,4vw,48px)/1.4 system-ui}.native-death-scene p{font:16px/1.5 system-ui;background:#18080ad9;padding:8px 16px;border-radius:8px}.native-death-scene[data-phase="respawned"]{background:transparent;justify-content:flex-end;padding-bottom:20vh;box-sizing:border-box}.native-death-scene[data-phase="respawned"] strong{font-size:22px}@keyframes native-death-in{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.native-death-scene{animation:none}}`
  document.head.append(style)
  let playerUuid=null,episode=null,dead=false,respawnedUntil=0
  const set=(element,text)=>{if(element.textContent!==text)element.textContent=text}
  const reset=()=>{episode=null;dead=false;respawnedUntil=0;panel.hidden=true;delete panel.dataset.phase}
  return {panel,
    setIdentity(identity){const next=identity?.confirmed===true?identity.playerUuid?.toLowerCase():null;if(next!==playerUuid){reset();playerUuid=next}},
    update(presentation){
      if(!playerUuid||presentation?.available!==true||presentation.playerUuid?.toLowerCase()!==playerUuid){reset();return}
      const self=presentation.self,time=now(),lifecycle=self?.deathLifecycle
      if(self?.health===0){
        if(!dead){episode=typeof lifecycle?.episodeId==='string'?lifecycle.episodeId:`observed-zero-health:${time}`;dead=true}
        panel.hidden=false;panel.dataset.phase='dead';panel.dataset.episode=episode
        set(title,'你倒下了…')
        const deadline=typeof lifecycle?.respawnAt==='string'?Date.parse(lifecycle.respawnAt):lifecycle?.respawnAt
        const remaining=Number.isFinite(deadline)?deadline-time:null
        set(detail,remaining!==null&&remaining>0&&remaining<=15000?`${Math.ceil(remaining/1000)} 秒后重新出发`:'等待重生 · 刚才的经历会留在记录中')
      }else if(Number.isFinite(self?.health)&&self.health>0&&dead){
        dead=false;respawnedUntil=time+2400;panel.dataset.phase='respawned'
        set(title,'重新出发');set(detail,'先看看周围，再决定下一步')
      }else if(!dead&&time>=respawnedUntil)panel.hidden=true
    },reset,
    dispose(){reset();panel.remove();style.remove();playerUuid=null}
  }
}
