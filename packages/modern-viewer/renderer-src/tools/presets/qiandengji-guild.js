/** Display adapter for observed 千灯纪 guild CLI text; no game commands or model events. */
(function installQiandengjiGuildDisplay() {
  let snapshot = null;
  let section = null;
  let boardAt = 0;
  let certification = '';
  let active = null;
  const create = () => ({ schemaVersion: 1, id: 'qiandengji:guild', title: '公会委托',
    subtitle: certification, source: '千灯纪公会', observedAt: Date.now(), sections: [], summary: active });
  function publish(documents, expand = true) {
    snapshot ??= create();
    snapshot.subtitle = certification;
    snapshot.summary = active;
    snapshot.observedAt = Date.now();
    documents.set(snapshot, { expand });
  }
  function adapter(event, documents) {
    if (event?.kind !== 'system' || typeof event.text !== 'string') return false;
    const line = event.text.replace(/§[0-9a-fk-or]/gi, '').trim();
    if (/^冒险者认证：/.test(line)) {
      certification = line;
      publish(documents);
      return true;
    }
    const ongoing = /^正在进行：(.+?)\s*\[(\d+)\/(\d+)\]\s*$/.exec(line);
    if (ongoing) {
      active = { title: ongoing[1], body: '', status: `进行中 · ${ongoing[2]}/${ongoing[3]}` };
      const known = snapshot?.sections.flatMap(value => value.rows).find(value => value.title === ongoing[1]);
      if (known) {
        known.status = active.status;
        active = { ...known };
      }
      publish(documents);
      return true;
    }
    const heading = /^【(.{1,120})】$/.exec(line);
    if (heading && /(?:动态委托|冒险者公会\s*·\s*常驻委托|今日公会看板)/.test(heading[1])) {
      if (/动态委托/.test(heading[1]) || !snapshot || Date.now() - boardAt > 1_500) {
        snapshot = create();
        section = null;
      }
      boardAt = Date.now();
      section = { title: heading[1], rows: [] };
      snapshot.sections.push(section);
      publish(documents);
      return true;
    }
    const offer = /^([a-z][a-z0-9_.:-]{0,79})\s+(.+?)\s*·\s*(.*?)\s*·\s*(.*?)\s*\[([^\]]{1,60})\]\s*$/.exec(line);
    if (offer && snapshot && section && Date.now() - boardAt <= 3_000) {
      boardAt = Date.now();
      const entry = { id: offer[1], title: offer[2], body: offer[3], detail: offer[4],
        status: active?.title === offer[2] ? active.status : offer[5] };
      const previous = section.rows.findIndex(value => value.id === entry.id);
      if (previous >= 0) section.rows[previous] = entry;
      else if (section.rows.length < 64) section.rows.push(entry);
      if (active?.title === entry.title) active = { ...entry, status: active.status };
      publish(documents);
      return true;
    }
    return false;
  }
  adapter.reset = () => { snapshot = section = active = null; boardAt = 0; certification = ''; };
  globalThis.mcViewerGameMessagePreset = adapter;
})();
