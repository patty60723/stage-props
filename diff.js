/* 純函式：本機狀態 ⇄ Firestore 文件、以及「哪些文件要寫入」的差異計算（不依賴 Firebase，可單獨測試） */
export const DEL = '__DEL__';
export const COLLS = ['stages', 'props', 'events', 'scenes'];
const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
export const same = (a, b) => stable(a) === stable(b);
const strip = o => { const { id, ...r } = o; return r; };

const plToMap = list => { const m = {}; for (const p of list || []) m[p.id] = { propId: p.propId, x: p.x, y: p.y, rot: p.rot || 0, t: p.t || 0 }; return m; };
const plFromMap = map => Object.entries(map || {}).map(([pid, p]) => ({ id: pid, ...p }))
  .sort((a, b) => (a.t || 0) - (b.t || 0) || (a.id < b.id ? -1 : 1));

/* 事件＝日期＋舞台。舊版事件文件裡有 placements（舊資料），讀進來後由 app 轉成場景 */
export const evToDoc = e => ({ name: e.name, date: e.date || '', stageId: e.stageId, migrated: !!e.migrated });
export const evFromDoc = (id, d) => ({ id, name: d.name || '', date: d.date || '', stageId: d.stageId, migrated: !!d.migrated, placements: plFromMap(d.placements) });

/* 場景＝某位同學在某事件中的一張舞台排法；placements 存成 map，兩人同時移動不同道具不會互相蓋掉 */
export const sceneToDoc = s => ({ eventId: s.eventId, owner: s.owner || '', title: s.title || '', t: s.t || 0, placements: plToMap(s.placements) });
export const sceneFromDoc = (id, d) => ({ id, eventId: d.eventId, owner: d.owner || '', title: d.title || '', t: d.t || 0, placements: plFromMap(d.placements) });

export function fromDocs(name, docs) {
  if (name === 'events') return docs.map(({ id, ...r }) => evFromDoc(id, r));
  if (name === 'scenes') return docs.map(({ id, ...r }) => sceneFromDoc(id, r));
  return docs;
}

/* prev / next: {stages, props, events, scenes}；回傳要送出的寫入 [{op:'set'|'update'|'delete', coll, id, data}] */
export function computeOps(prev, next) {
  const ops = [];
  for (const c of ['stages', 'props', 'events']) {
    const toDoc = c === 'events' ? evToDoc : strip;
    const pm = new Map(prev[c].map(x => [x.id, x])), seen = new Set();
    for (const x of next[c]) {
      seen.add(x.id); const p = pm.get(x.id);
      if (!p || !same(toDoc(p), toDoc(x))) ops.push({ op: 'set', coll: c, id: x.id, data: toDoc(x) });
    }
    for (const id of pm.keys()) if (!seen.has(id)) ops.push({ op: 'delete', coll: c, id });
  }
  const pm = new Map(prev.scenes.map(x => [x.id, x])), seen = new Set();
  for (const x of next.scenes) {
    seen.add(x.id); const p = pm.get(x.id), nd = sceneToDoc(x);
    if (!p) { ops.push({ op: 'set', coll: 'scenes', id: x.id, data: nd }); continue; }
    const pd = sceneToDoc(p), upd = {};
    for (const k of ['eventId', 'owner', 'title', 't']) if (pd[k] !== nd[k]) upd[k] = nd[k];
    for (const [id, v] of Object.entries(nd.placements)) if (!same(pd.placements[id], v)) upd['placements.' + id] = v;
    for (const id of Object.keys(pd.placements)) if (!(id in nd.placements)) upd['placements.' + id] = DEL;
    if (Object.keys(upd).length) ops.push({ op: 'update', coll: 'scenes', id: x.id, data: upd });
  }
  for (const id of pm.keys()) if (!seen.has(id)) ops.push({ op: 'delete', coll: 'scenes', id });
  return ops;
}
