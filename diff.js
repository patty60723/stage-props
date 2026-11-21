/* 純函式：本機狀態 ⇄ Firestore 文件、以及「哪些文件要寫入」的差異計算（不依賴 Firebase，可單獨測試） */
export const DEL = '__DEL__';
const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export const same = (a, b) => stable(a) === stable(b);
const strip = o => { const { id, ...r } = o; return r; };

/* 事件文件：placements 存成 {placementId: {...}} 的 map，這樣兩個人同時移動不同道具不會互相蓋掉 */
export function evToDoc(e) {
  const pl = {};
  for (const p of e.placements || []) pl[p.id] = { propId: p.propId, x: p.x, y: p.y, rot: p.rot || 0, t: p.t || 0 };
  return { name: e.name, date: e.date || '', stageId: e.stageId, placements: pl };
}
export function evFromDoc(id, d) {
  const placements = Object.entries(d.placements || {}).map(([pid, p]) => ({ id: pid, ...p }))
    .sort((a, b) => (a.t || 0) - (b.t || 0) || (a.id < b.id ? -1 : 1));
  return { id, name: d.name || '', date: d.date || '', stageId: d.stageId, placements };
}

/* prev / next: {stages, props, events}；回傳要送出的寫入 [{op:'set'|'update'|'delete', coll, id, data}] */
export function computeOps(prev, next) {
  const ops = [];
  for (const c of ['stages', 'props']) {
    const pm = new Map(prev[c].map(x => [x.id, x])), seen = new Set();
    for (const x of next[c]) {
      seen.add(x.id); const p = pm.get(x.id);
      if (!p || !same(strip(p), strip(x))) ops.push({ op: 'set', coll: c, id: x.id, data: strip(x) });
    }
    for (const id of pm.keys()) if (!seen.has(id)) ops.push({ op: 'delete', coll: c, id });
  }
  const pm = new Map(prev.events.map(x => [x.id, x])), seen = new Set();
  for (const x of next.events) {
    seen.add(x.id); const p = pm.get(x.id), nd = evToDoc(x);
    if (!p) { ops.push({ op: 'set', coll: 'events', id: x.id, data: nd }); continue; }
    const pd = evToDoc(p), upd = {};
    for (const k of ['name', 'date', 'stageId']) if (pd[k] !== nd[k]) upd[k] = nd[k];
    for (const [id, v] of Object.entries(nd.placements)) if (!same(pd.placements[id], v)) upd['placements.' + id] = v;
    for (const id of Object.keys(pd.placements)) if (!(id in nd.placements)) upd['placements.' + id] = DEL;
    if (Object.keys(upd).length) ops.push({ op: 'update', coll: 'events', id: x.id, data: upd });
  }
  for (const id of pm.keys()) if (!seen.has(id)) ops.push({ op: 'delete', coll: 'events', id });
  return ops;
}
