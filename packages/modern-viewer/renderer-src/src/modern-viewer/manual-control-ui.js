/** Portable input surfaces. Existing dashboard shells may already provide them. */
export function ensureManualControlUi(document) {
  let root=document.getElementById('manual-viewer-overlay');
  const make=(tag,id,text,parent)=>{const el=document.createElement(tag);el.id=id;if(text)el.textContent=text;parent.append(el);return el;};
  if(!root){
    root=make('div','manual-viewer-overlay','',document.body);root.className='manual-viewer-overlay';root.setAttribute('aria-hidden','true');
    const stick=make('div','touch-stick','',root);stick.className='touch-stick';stick.setAttribute('aria-label','移动摇杆');
    make('span','touch-stick-knob','',stick);
    const actions=make('div','touch-actions','',root);actions.className='touch-actions';
    for(const [id,text]of [['touch-sprint','疾跑'],['touch-jump','跳跃'],['touch-stop','停下']]){const b=make('button',id,text,actions);b.type='button';}
    make('div','gamepad-chip','手柄未连接',root).className='gamepad-chip';
  }
  const actions=root.querySelector('.touch-actions')??root;
  for(const[id,text]of [['touch-primary','攻击／挖掘'],['touch-secondary','使用／放置']])if(!document.getElementById(id)){
    const b=make('button',id,text,actions);b.type='button';b.setAttribute('aria-label',text);
  }
  return root;
}
