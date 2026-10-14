const PHASES = {queued:'排队',running:'执行中',acting:'执行中',completed:'已返回',returned:'已返回',blocked:'阻塞',
  failed:'失败',cancelled:'已取消',rejected:'参数被拒绝',pending:'等待',unknown:'结果未知'}
const LABELS = {health:'生命变化',food:'饥饿变化',dig_started:'开始挖掘',dig_cancel_sent:'发送取消挖掘',dig_finish_sent:'提交挖掘',
  dig_completed:'挖掘完成',dig_aborted:'挖掘中止',block_changed:'方块更新',path_blocked:'寻路失败',path_reset:'重算路线',
  path_reached:'到达目标',use:'使用物品／方块',attack:'攻击',interact:'交互',entity_hurt:'实体受伤',death:'死亡',
  open_window:'打开窗口',close_window:'关闭窗口',trade_offers:'收到交易报价',trade_selected:'选择交易'}
const text = (value, maximum=240) => typeof value==='string'?value.slice(0,maximum):''
const finite = value => typeof value==='number'&&Number.isFinite(value)
const position = value => value&&['x','y','z'].every(k=>finite(value[k]))
  ?`(${['x','y','z'].map(k=>Math.round(value[k]*10)/10).join(', ')})`:''
const clock = value => {const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleTimeString('zh-CN',{hour12:false}):''}

// Application telemetry, not a replacement Minecraft GUI. Native inventory and
// menus continue using original assets; this inspector labels evidence sources.
export function createNativeActivityUi({document, itemName=item=>item?.displayName??item?.name??'未知物品',renderItem=null}={}) {
  const add=(parent,tag,className,value)=>{
    const element=document.createElement(tag)
    if(className)element.className=className
    if(value!==undefined)element.textContent=value
    parent.append(element);return element
  }
  const root=add(document.body,'aside','native-live-inspector')
  root.setAttribute('aria-label','游戏操作与任务进程')
  const status=add(root,'div','native-inspector-status','等待本人操作数据')
  const panes=new Map()
  for(const [key,title]of [['events','操作过程'],['items','物品收支'],['recipes','合成与材料'],['merchant','交易报价'],
    ['survival','生存变化'],['queue','Agent 任务时间线'],['server','服务器信息'],['entities','附近实体']]) {
    const details=add(root,'details','native-inspector-pane');details.dataset.category=key
    if(key==='events')details.setAttribute('open','')
    add(details,'summary','',title);panes.set(key,add(details,'div','native-inspector-body'))
  }
  const style=add(document.head,'style','')
  style.textContent=`
    .native-live-inspector{position:fixed;z-index:6;top:176px;right:14px;width:min(320px,calc(100vw - 28px));max-height:65vh;overflow:auto;color:#e8eeeb;background:var(--mc-viewer-ui-bg,#11242ce8);border:1px solid var(--mc-viewer-ui-border,#aec3b4);border-radius:8px;font:12px/1.5 system-ui;backdrop-filter:blur(8px)}
    .native-inspector-status{padding:8px 10px;color:#afc9c6;border-bottom:1px solid #b9d0c52b}
    .native-inspector-pane>summary{cursor:pointer;padding:7px 10px;font-weight:600}.native-inspector-pane[open]>summary{background:#a6cbb912}
    .native-inspector-body{padding:0 10px 8px}.native-inspector-row{padding:5px 0;border-bottom:1px solid #a6cbb918;overflow-wrap:anywhere}
    .native-inspector-row small{display:block;color:#a9bdb9;font-size:10px}.native-inspector-note{color:#a9bdb9;margin:5px 0;font-size:11px}
    .native-inspector-item{display:flex;align-items:center;gap:7px}.native-inspector-item>.corti-menu-slot{position:relative;flex:none;width:32px;height:32px}
    .native-inspector-gain{color:#ade0bd}.native-inspector-loss{color:#efbeab}.native-inspector-body progress{width:100%}
    @media(max-width:900px){.native-live-inspector{top:164px;width:250px;max-height:49vh;font-size:11px}}
    @media(max-width:600px){.native-live-inspector{top:auto;bottom:130px;width:230px;max-height:32vh}.native-inspector-pane>summary{padding:5px 8px}}
  `
  let identity=null,epoch=null,signature=null,disposed=false
  const empty=(panel,value)=>{panel.replaceChildren();add(panel,'p','native-inspector-note',value)}
  const itemText=item=>text(itemName(item),120)||text(item?.name)||'未知物品'
  const row=(panel,value,source)=>{
    const node=add(panel,'div','native-inspector-row',value)
    if(source)add(node,'small','',source)
    return node
  }
  const itemRow=(panel,item,value,source)=>{
    const line=add(panel,'div','native-inspector-row native-inspector-item')
    if(renderItem&&item?.snbt){const slot=add(line,'div','corti-menu-slot');renderItem(slot,item)}
    const body=add(line,'div','',value);if(source)add(body,'small','',source)
    return line
  }
  function reset() {
    signature=null
    status.textContent='等待本人操作数据'
    for(const panel of panes.values())empty(panel,'尚无记录')
  }
  function eventText(event) {
    if(event.kind==='slot_click')return `${event.button===1?'右键':'左键'} · 窗口 ${event.windowId} · 槽 ${event.slot} · 模式 ${event.mode}`
    const details=[event.delta!==undefined?`${event.delta>0?'+':''}${event.delta} → ${event.value}`:'',text(event.name),
      event.from?`${text(event.from)} → ${text(event.to)}`:'',text(event.reason),position(event.position),event.entityId!==undefined?`实体 ${event.entityId}`:''].filter(Boolean).join(' · ')
    return `${LABELS[event.kind]??text(event.kind)}${details?' · '+details:''}`
  }
  return {
    setIdentity(value) {
      const next=value?.confirmed===true&&typeof value.playerUuid==='string'?{uuid:value.playerUuid.toLowerCase(),entityId:value.entityId}:null
      if(JSON.stringify(next)!==JSON.stringify(identity)){reset();identity=next;epoch=null}
    },
    update(state,{iconRevision=0}={}) {
      if(disposed)return
      const presentation=state?.presentation,a=presentation?.activity
      if(!identity||!presentation?.available||presentation.playerUuid!==identity.uuid||a?.schemaVersion!==1||a.playerUuid!==identity.uuid||a.entityId!==identity.entityId){reset();return}
      if(epoch!==state.epoch){reset();epoch=state.epoch}
      const playback=presentation.agentPlayback
      const next=JSON.stringify([a.revision,a.dig?.elapsedMs,playback,iconRevision,presentation.nativeMenu?.windowId])
      if(signature===next)return
      signature=next;status.textContent=`本人实时操作 · ${clock(a.sampledAt)}${a.truncated?' · 历史已按预算截短':''}`
      const eventPanel=panes.get('events');empty(eventPanel,'当前没有新操作')
      if(a.events?.length){eventPanel.replaceChildren();for(const event of a.events.slice(-8).reverse())row(eventPanel,eventText(event),`${clock(event.at)} · ${event.source==='sent_packet'?'已发送，效果待核对':event.source?.startsWith('server')?'服务端观测':'Mineflayer 事件'}`)}
      if(a.dig){const section=row(eventPanel,`正在挖掘 ${text(a.dig.name)} ${position(a.dig.position)}`,'进度按实际开始时间与当前工具预计耗时显示，结果看方块更新')
        if(finite(a.dig.durationMs)&&a.dig.durationMs>0){const bar=add(section,'progress','');bar.max=1;bar.value=Math.min(1,a.dig.elapsedMs/a.dig.durationMs);bar.setAttribute('aria-label','当前挖掘进度')}}
      const itemPanel=panes.get('items');empty(itemPanel,a.inventoryReady?'当前没有服务端确认的背包增减':'等待完整服务端背包基线')
      if(a.items?.length){itemPanel.replaceChildren();for(const entry of a.items.slice(-12).reverse()){
        const line=itemRow(itemPanel,entry.item,`${itemText(entry.item)} ${entry.delta>0?'+':''}${entry.delta}`,`${clock(entry.at)} · 服务端背包差量；不推测来源`)
        line.className+=entry.delta>0?' native-inspector-gain':' native-inspector-loss'}}
      const recipePanel=panes.get('recipes');empty(recipePanel,'当前没有与已知材料匹配的原版配方')
      if(a.recipes?.length){recipePanel.replaceChildren();for(const recipe of a.recipes.slice(0,12)){
        row(recipePanel,`${itemText(recipe.output)} ×${recipe.output.count} · ${recipe.craftable?'材料齐备':recipe.requiresTable&&!recipe.tableOpen?'需要打开工作台':'材料不足'}`,
          (recipe.missing??[]).map(item=>`${itemText(item)} 缺 ${item.count}`).join('；')||'原版配方目录预览，尚未执行合成')}
        add(recipePanel,'p','native-inspector-note','实际放料、光标与产物见背包／工作台窗口；目录可合成不等于已经获得物品。')}
      const merchant=a.merchant&&presentation.nativeMenu?.windowId===a.merchant.windowId?a.merchant:null
      const tradePanel=panes.get('merchant');empty(tradePanel,'当前未打开已收到报价的交易窗口')
      if(merchant){tradePanel.replaceChildren();for(const offer of merchant.offers.slice(0,24)){
        const input=`${itemText(offer.input)} ×${offer.price??'?'}`+(offer.second?` + ${itemText(offer.second)} ×${offer.second.count}`:'')
        itemRow(tradePanel,offer.output,`${offer.index===merchant.selected?'▶ ':''}${input} → ${itemText(offer.output)} ×${offer.output?.count??'?'}`,
          `${offer.disabled||finite(offer.maxUses)&&offer.uses>=offer.maxUses?'已售罄':'可交易'} · 已用 ${offer.uses??'?'}/${offer.maxUses??'?'} · 服务端报价，选择不代表购买`)}}
      const survivalPanel=panes.get('survival'),vitalEvents=(a.events??[]).filter(event=>['health','food','death','entity_hurt'].includes(event.kind))
      empty(survivalPanel,'当前没有新的生命／饥饿变化')
      if(vitalEvents.length){survivalPanel.replaceChildren();for(const event of vitalEvents.slice(-10).reverse())row(survivalPanel,eventText(event),clock(event.at))}
      const queuePanel=panes.get('queue');empty(queuePanel,'等待框架公开队列；游戏协议不包含规划队列')
      if(playback){queuePanel.replaceChildren();for(const execution of (playback.queue??[]).slice(0,12))row(queuePanel,
        `${PHASES[execution.phase]??(text(execution.phase)||'等待')} · ${text(execution.operation)||text(execution.kind)||'任务'}`,text(execution.id))
        for(const receipt of (playback.timeline??[]).slice(-12).reverse())row(queuePanel,
          `${text(receipt.action?.type)} / ${text(receipt.action?.operation)} · ${PHASES[receipt.result?.code]??text(receipt.result?.code)} · ${receipt.result?.effectVerified===true?'效果已验证':'效果未验证'}`,
          `${clock(receipt.at)}${receipt.notice?' · '+text(receipt.notice):''}`)
        if(!(playback.queue?.length||playback.timeline?.length))empty(queuePanel,'当前没有排队任务／近期回执')}
      const serverPanel=panes.get('server');serverPanel.replaceChildren()
      if(a.server?.sidebar){row(serverPanel,text(a.server.sidebar.title));for(const score of a.server.sidebar.rows??[])row(serverPanel,`${text(score.text)} ${score.value??''}`)}
      else row(serverPanel,'尚未收到侧边任务记分板')
      row(serverPanel,`游戏时刻 ${finite(a.server?.time)?a.server.time:'未知'} · 天气 ${a.server?.raining===true?'下雨':a.server?.raining===false?'晴':'未知'}`)
      row(serverPanel,`已收到玩家列表 ${(a.server?.players??[]).map(player=>text(player.name,32)).join('、')||'空'}`)
      const entityPanel=panes.get('entities');empty(entityPanel,'当前没有已跟踪的附近实体')
      if(a.entities?.length){entityPanel.replaceChildren();for(const entity of a.entities.slice(0,24))row(entityPanel,`${text(entity.name)} · ${finite(entity.distance)?entity.distance.toFixed(1)+' 格':'距离未知'}`,`${position(entity.position)} · 实体 ${entity.id}`)}
    },
    reset,
    dispose(){if(disposed)return;disposed=true;root.remove();style.remove()},
    root
  }
}
