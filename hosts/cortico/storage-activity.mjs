// Read-only projection of the Qiandengji storage protocol carried by Cortico World events.
// Views are scoped to one observed body. No command, task text or inventory delta is a transfer receipt.
const lifetimeMs = 15000;
const maximumBatch = 64;
const validId = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const queries = new Map([
  ['storage.stash', '个人箱'], ['storage.overview', '个人箱总览'], ['storage.inventory', '随身物品'],
]);
const failure = new Map([
  ['empty', '槽位为空'], ['soulbound', '绑定物品'], ['stash_full', '箱满'],
  ['no_matching_item', '没有匹配物品'], ['insufficient_items', '物品不足'],
]);
const count = value => Number.isSafeInteger(value) && value >= 0;

function itemName(id, language, custom) {
  if (!validId.test(id)) return null;
  const clean = typeof custom === 'string' ? custom.replace(/§.|[\p{Cc}\p{Cf}]/gu, '').trim().slice(0,36) : '';
  const key = id.replace(':', '.').replaceAll('/', '.');
  return clean || language['item.' + key] || language['block.' + key] || id;
}

function queryRows(query, username, language) {
  const label = queries.get(query?.query);
  if (!label || query.username !== username) return null;
  if (query.outcomeUnknown === true) return [{label, text:'查询结果未确认', tone:'warning'}];
  if (query.phase === 'cancelled' || query.phase === 'send_failed') return [{label, text:query.phase==='cancelled'?'查询已取消':'查询未发出', tone:'warning'}];
  if (query.phase !== 'replied') return null;
  if (query.reply?.ok === false) return [{label, text:'查询被拒绝', tone:'warning'}];
  if (query.reply?.ok !== true) return null;
  const data = query.reply.data;
  if (!data || query.reply.dataTruncated === true || data.complete === false) return [{label,text:'收到部分数据，完整内容未确认',tone:'warning'}];
  if (query.query === 'storage.overview') {
    if (data.scope !== 'all_pages' || data.source !== 'personal_stash' || !count(data.pageCount) || data.pageCount < 1
      || !count(data.occupiedSlots) || !count(data.freeSlots) || data.occupiedSlots + data.freeSlots !== data.capacity) return null;
    return [{label:'查阅 · 个人箱总览', text:data.pageCount+' 页 · 已用 '+data.occupiedSlots+' 格 · 空 '+data.freeSlots+' 格', tone:'info'}];
  }
  const stash = query.query === 'storage.stash';
  if (stash ? data.source !== 'personal_stash' || data.scope !== 'requested_page_only' || !count(data.page)
    || !count(data.pages) || data.page < 1 || data.page > data.pages : data.source !== 'inventory') return null;
  const occupied = stash ? data.occupiedOnPage : data.occupied;
  const capacity = stash ? data.pageSize : data.capacity;
  if (!count(occupied) || !count(capacity) || occupied > capacity || !Array.isArray(data.items)) return null;
  const rows = [];
  for (const item of data.items) {
    if (!item || !count(item.slot) || !count(item.count) || !item.count || typeof item.id !== 'string') continue;
    const name = itemName(item.id, language, item.displayName);
    if (name) rows.push({label:(stash?'箱槽 ':'背包槽 ')+item.slot, text:name+' ×'+item.count, tone:'info'});
    if (rows.length === 2) break;
  }
  rows.unshift({label:'查阅 · '+label+(stash?' '+data.page+'/'+data.pages+' 页':''),
    text:'当时已用 '+occupied+'/'+capacity+' 格'+(occupied>rows.length?' · 展示 '+rows.length+' 格':''), tone:'info'});
  return rows;
}

function transferRow(event, language) {
  if (event.meta?.channel !== 'system' || event.meta?.executionFeedback?.kind !== 'server-message' || typeof event.text !== 'string') return null;
  const line = event.text;
  const usage = /^\[MC 系统\] 用法[：:]\s*\/mycli arena stash (putslot|put|take)(?:\s|$)/.exec(line);
  if (usage) return {label:usage[1]==='take'?'取出未执行':'存入未执行', text:'服务器返回了参数用法', tone:'warning'};
  const match = /^\[MC 系统\] MC_STASH_(PUT|TAKE) (.{1,1600})$/u.exec(line);
  if (!match) return null;
  // Suggestions may contain spaces, quantities and commands. Read only the receipt's leading scalar fields.
  const fields = new Map();
  for (const token of match[2].split(/\s+/)) {
    const part = /^([A-Za-z]+)=([a-zA-Z0-9_./:-]+)$/.exec(token);
    if (!part) break;
    if (fields.has(part[1])) return null;
    fields.set(part[1],part[2]);
  }
  if (!/^\d{1,8}$/.test(fields.get('moved')??'')) return null;
  const moved = Number(fields.get('moved')), put = match[1]==='PUT', action = put?'存入':'取出';
  const slot = fields.get('slot'), loc = /^\d{1,5}$/.test(slot??'') ? ' · '+(put?'背包槽 ':'箱槽 ')+slot : '';
  if (!moved) return {label:'未'+action+loc, text:failure.get(fields.get('reason'))??'实际移动 0 件', tone:'warning'};
  const name = itemName(fields.get('id')??'', language);
  if (!name) return null;
  const requested = fields.get('requested');
  if (requested !== undefined && (!/^\d{1,8}$/.test(requested) || Number(requested)<moved)) return null;
  const partial = requested !== undefined && moved < Number(requested);
  return {label:(partial?'部分':'已')+action+loc,
    text:name+' ×'+moved+(partial?'（请求 '+Number(requested)+'）':''), tone:partial?'warning':'success'};
}

/** One feed per camera subscription. Read only newly arrived events from the explicitly mapped World. */
export function createCorticoStorageFeed({source, username, language = {}, readEvents}) {
  if (!/^[\w-]{1,64}$/.test(source??'') || !/^[a-zA-Z0-9_\. -]{1,64}$/.test(username??'') || typeof readEvents !== 'function')
    throw Error('explicit_storage_subject_required');
  let cursor, session, lastPoll = 0, generation = 0, view = null, transfers = [];
  function reset() { view=null; transfers=[]; generation++; }
  return {
    async poll({latest, startedAt, now=Date.now()}) {
      if (!count(latest) || !Number.isFinite(Date.parse(startedAt))) { reset(); cursor=undefined; return; }
      const from = cursor;
      const newSession = session!==startedAt || from===undefined || latest<from || now-lastPoll>lifetimeMs;
      session=startedAt; lastPoll=now;
      if (newSession) { reset(); cursor=latest; return; }
      if (latest===from) return;
      const first = Math.max(from+1,latest-maximumBatch+1), version=generation;
      const payload = await readEvents({source,from:first,to:latest,limit:latest-first+1});
      if (version!==generation || cursor!==from || !Array.isArray(payload?.events)) return;
      cursor=latest;
      for (const event of payload.events) {
        if (event?.source!==source || event.origin!=='external' || event.senderKey!=='minecraft'
          || !count(event.cursor) || event.cursor<first || event.cursor>latest) continue;
        const at=Date.parse(event.ts);
        if (!Number.isFinite(at) || at>now+1000 || now-at>=lifetimeMs) continue;
        if (event.type===source+'.event') {
          const rows=queryRows(event.meta?.serverQuery,username,language);
          if (rows) view={at,rows};
        } else if (event.type===source+'.chat') {
          const row=transferRow(event,language);
          if (row) transfers=[...transfers,{at,row}].slice(-2);
        }
      }
    },
    panel({now=Date.now(),anchor='bottom_left'}={}) {
      const rows=[];
      if (view && now-view.at<lifetimeMs) rows.push(...view.rows);
      for (const transfer of transfers) if (now-transfer.at<lifetimeMs) rows.push(transfer.row);
      return rows.length?{id:'storage-activity',title:'仓储操作',anchor,width:220,bottomInset:58,rows}:null;
    },
  };
}
