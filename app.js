'use strict';
/* 舞台道具排列 — 純前端；資料存在 Firebase Firestore（以班級代碼區分），未設定時存在瀏覽器 localStorage */
const KEY = 'stage-props-v1';
const SRC = {
  theatre: { label: '劇場提供', color: '#3b82f6' },
  personal: { label: '個人提供', color: '#f59e0b' },
  actor: { label: '演員', color: '#10b981' },
};
const FONT = "system-ui,'Noto Sans TC','Microsoft JhengHei',sans-serif";
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : d; };
const r2 = n => Math.round(n * 100) / 100;

function seed() {
  const st = uid();
  return {
    currentEventId: null,
    stages: [{ id: st, name: '示範舞台', w: 8, d: 6, notes: '' }],
    props: [
      { id: uid(), name: '椅子', source: 'theatre', owner: '', w: 0.45, d: 0.45, notes: '' },
      { id: uid(), name: '小圓桌', source: 'theatre', owner: '', w: 0.8, d: 0.8, notes: '' },
      { id: uid(), name: '譜架', source: 'personal', owner: '小明', w: 0.5, d: 0.4, notes: '' },
      { id: uid(), name: '小明', source: 'actor', owner: '小明', w: 0.5, d: 0.5, notes: '' },
    ],
    events: [],
  };
}
const CFG = window.FIREBASE_CONFIG || null;           // 沒設定 Firebase → 單機模式
const CUR_KEY = 'stage-props-cur', CODE_KEY = 'stage-props-code';
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
let legacy = null; try { legacy = JSON.parse(lsGet(KEY)); } catch { }
let S = CFG ? { currentEventId: lsGet(CUR_KEY), stages: [], props: [], events: [], scenes: [] } : (legacy || seed());
S.scenes = S.scenes || [];
const LAST_KEY = 'stage-props-last';
const cloud = { server: {}, giveUp: false, api: null, diff: null, code: null, ok: false, got: {}, stash: {}, fromCache: true, err: null, remote: { stages: [], props: [], events: [], scenes: [] } };
const snap = s => JSON.parse(JSON.stringify({ stages: s.stages, props: s.props, events: s.events, scenes: s.scenes }));
const ui = { tab: 'editor', sel: null, q: '', src: 'all', editProp: null, editStage: null, pal: (lsGet('stage-props-pal') === 'color' ? 'color' : 'bw'), listOpen: false, zoom: 1, nudge: 0.05, full: false, view: 'home', outScene: '__all', sceneId: null, group: false };

/* 存檔：單機模式寫 localStorage；雲端模式把「和上次同步狀態的差異」送到 Firestore。回傳送出的寫入數 */
function save() {
  if (!CFG) { lsSet(KEY, JSON.stringify(S)); return 0; }
  lsSet(CUR_KEY, S.currentEventId || '');
  if (!cloud.api) return 0;
  const ops = cloud.diff.computeOps(cloud.remote, S);
  if (ops.length) { cloud.api.write(ops); cloud.remote = snap(S); }
  return ops.length;
}
const stageOf = id => S.stages.find(s => s.id === id);
const propOf = id => S.props.find(p => p.id === id);
const curEvent = () => S.events.find(e => e.id === S.currentEventId) || null;
/* 演員不需要寬深：一律用固定大小的圓形標示 */
const ACTOR = 0.5;
const propSize = p => p.source === 'actor' ? { w: ACTOR, d: ACTOR } : { w: p.w, d: p.d };
const sizeText = p => p.source === 'actor' ? '—' : `${p.w}×${p.d}`;
const ownerKey = p => p.source === 'theatre' ? '劇場' : (p.owner || '（未指定）');
const ME_KEY = 'stage-props-me';
const scenesOf = eid => S.scenes.filter(s => s.eventId === eid).sort((a, b) => (a.t || 0) - (b.t || 0) || (a.id < b.id ? -1 : 1));
function curScene() {
  const ev = curEvent(); if (!ev) return null;
  const l = scenesOf(ev.id), me = lsGet(ME_KEY);
  return l.find(s => s.id === ui.sceneId) || (me && l.find(s => s.owner === me)) || l[0] || null;
}
const sceneLabel = s => (s.owner || '（未命名）') + (s.title ? '・' + s.title : '');
/* 舊版：道具直接放在事件裡 → 轉成一個「全班（舊資料）」場景 */
function migrateLegacy() {
  let ch = false;
  for (const e of S.events) {
    if (!e.migrated && e.placements?.length) {
      const sid = 'm' + e.id;
      if (!S.scenes.some(x => x.id === sid)) S.scenes.push({ id: sid, eventId: e.id, owner: '全班（舊資料）', title: '', t: 0, placements: e.placements });
      e.migrated = true; ch = true;
    }
    delete e.placements;
  }
  return ch;
}
const fmtEv = e => `${e.date || '未定日期'}｜${e.name}｜${stageOf(e.stageId)?.name || '?'}`;

/* ---------- stage SVG（單位：公尺） ---------- */
/* 配色：預設「黑白友善」——三類在灰階下深淺差很大；個人提供再加虛線邊框＋斜線底紋，演員本來就是圓形 */
const PAL = {
  bw: { theatre: { c: '#3b82f6', t: '#1e40af', fo: .25 }, personal: { c: '#c2410c', t: '#9a3412', fo: .1, dash: true, hatch: true }, actor: { c: '#16a34a', t: '#14532d', fo: .25 } },
  color: { theatre: { c: '#3b82f6', t: '#1d4ed8' }, personal: { c: '#f59e0b', t: '#b45309' }, actor: { c: '#10b981', t: '#047857' } },
};
const PAL_KEY = 'stage-props-pal';
const pal = src => PAL[ui.pal === 'color' ? 'color' : 'bw'][src];
const STAGE_M = 0.9;                                          // 舞台左右留白（外移的標籤會用到）
const aabb = (x, y, w, d, rot) => { const r = rot * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)); return { x, y, w: w * c + d * s, h: w * s + d * c }; };
const hitBox = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
const halo = fs => `paint-order="stroke" stroke="#fff" stroke-width="${fs * .28}" stroke-linejoin="round"`;
function inShape(px, py, it) {                                // 點是否落在道具的實際形狀內（含旋轉；演員為橢圓）
  const r = -(it.pl.rot || 0) * Math.PI / 180, dx = px - it.pl.x, dy = py - it.pl.y, lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
  return it.p.source === 'actor' ? (lx / (it.sz.w / 2)) ** 2 + (ly / (it.sz.d / 2)) ** 2 <= 1 : Math.abs(lx) <= it.sz.w / 2 && Math.abs(ly) <= it.sz.d / 2;
}
const rectInside = (it, bw, bh) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([sx, sy]) => inShape(it.pl.x + sx * bw / 2, it.pl.y + sy * bh / 2, it));
function boxHitsShape(box, it) {                              // 文字框是否壓到某個道具
  for (let a = 0; a <= 6; a++) for (let b = 0; b <= 2; b++) if (inShape(box.x - box.w / 2 + box.w * a / 6, box.y - box.h / 2 + box.h * b / 2, it)) return true;
  const r = (it.pl.rot || 0) * Math.PI / 180, pts = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => { const lx = sx * it.sz.w / 2, ly = sy * it.sz.d / 2; return [it.pl.x + lx * Math.cos(r) - ly * Math.sin(r), it.pl.y + lx * Math.sin(r) + ly * Math.cos(r)]; });
  return pts.some(([qx, qy]) => Math.abs(qx - box.x) <= box.w / 2 && Math.abs(qy - box.y) <= box.h / 2);
}
let hatchN = 0;
/* 回傳 { svg, nums }：nums = 以編號標示的小道具 [{n, p, count}]（單獨、字放不下的才會編號） */
function stageParts(ev, sc, opt = {}) {
  const st = stageOf(ev.stageId); if (!st) return { svg: '', nums: [] };
  const { w, d } = st, m = STAGE_M, fs = Math.max(w, d) * 0.025, selId = opt.interactive ? ui.sel : null;
  const items = (sc?.placements || []).map(pl => ({ pl, p: propOf(pl.propId) })).filter(x => x.p).map(x => ({ ...x, sz: propSize(x.p), ...(({ c, t, fo, dash, hatch }) => ({ c, tc: t, fo, dash, hatch }))(pal(x.p.source)) }));
  const boxes = items.map(i => aabb(i.pl.x, i.pl.y, i.sz.w, i.sz.d, i.pl.rot || 0));
  const order = items.map((_, k) => k).sort((a, b) => items[b].sz.w * items[b].sz.d - items[a].sz.w * items[a].sz.d || a - b);   // 大的先畫，小的疊在上面
  const rank = []; order.forEach((k, r) => rank[k] = r);
  let TC = '#111827'; const lines = [], labels = [];
  const textEl = (t, cx, cy, f) => `<text x="${cx}" y="${cy + f * .35}" font-size="${f}" font-weight="600" text-anchor="middle" fill="${TC}" ${halo(f)}>${esc(t)}</text>`;
  const lw = (t, f) => [...t].length * f;
  const inBounds = ([px, py], W, H) => px - W / 2 > -m + .05 && px + W / 2 < w + m - .05 && py - H / 2 > -fs * .3 && py + H / 2 < d + fs * 1.9;
  function placeOutside(k, name, placed) {                    // 把標籤放到旁邊：不壓到別的標籤，也不壓到任何道具
    const b = boxes[k], x = items[k].pl.x, y = items[k].pl.y, H = fs * 1.35, W = lw(name, fs) + fs * .7, hw = b.w / 2, hh = b.h / 2, gap = fs * .5, c = [];
    for (const kk of [1, 2, 3.4]) c.push([x + hw + gap * kk + W / 2, y], [x - hw - gap * kk - W / 2, y], [x, y - hh - gap * kk - H / 2], [x, y + hh + gap * kk + H / 2],
      [x + hw + gap * kk + W / 2, y - hh - H * kk], [x - hw - gap * kk - W / 2, y - hh - H * kk], [x + hw + gap * kk + W / 2, y + hh + H * kk], [x - hw - gap * kk - W / 2, y + hh + H * kk]);
    const bx = q => ({ x: q[0], y: q[1], w: W, h: H });
    const q = c.find(q => inBounds(q, W, H) && !placed.some(o => hitBox(bx(q), o)) && !boxes.some(o => hitBox(bx(q), o)))
      || c.find(q => inBounds(q, W, H) && !placed.some(o => hitBox(bx(q), o))) || c.find(q => inBounds(q, W, H)) || c[0];
    return { q, W, H };
  }
  const drawOut = (k, q, W, H) => {
    const i = items[k]; TC = i.tc;
    lines.push(`<line x1="${i.pl.x}" y1="${i.pl.y}" x2="${q[0]}" y2="${q[1]}" stroke="#374151" stroke-width="${fs * .1}"/><circle cx="${i.pl.x}" cy="${i.pl.y}" r="${fs * .22}" fill="#374151"/>`);
    labels.push(`<rect x="${q[0] - W / 2}" y="${q[1] - H / 2}" width="${W}" height="${H}" rx="${fs * .2}" fill="#fff" fill-opacity=".95" stroke="${i.c}" stroke-width="${fs * .1}"/>` + textEl(i.p.name, q[0], q[1], fs));
  };
  /* 先決定每個道具的標籤：寫在裡面／編號（單獨的小道具）／移到旁邊加細線（擠在一起或會被蓋住） */
  const MIN = fs * .7, plan = [], placed = [];
  for (const k of order) {
    const i = items[k], ch = [...i.p.name], n = ch.length, cand = [];
    for (const rows of [1, 2, 3]) { const per = Math.ceil(n / rows); for (let f = fs; f >= MIN - 1e-9; f *= .92) cand.push({ rows, per, f }); }
    cand.sort((a, b) => b.f - a.f || a.rows - b.rows);
    let pick = null;
    for (const c of cand) {
      const bw = c.per * c.f + c.f * .3, bh = c.rows * c.f * 1.15, box = { x: i.pl.x, y: i.pl.y, w: bw, h: bh };
      if (!rectInside(i, bw, bh)) continue;
      if (placed.some(o => hitBox(box, o))) continue;
      if (items.some((o, j) => j !== k && rank[j] > rank[k] && boxHitsShape(box, o))) continue;
      pick = { ...c, box }; break;
    }
    if (pick) { plan[k] = { t: 'in', ...pick }; placed.push(pick.box); continue; }
    const grown = { x: boxes[k].x, y: boxes[k].y, w: boxes[k].w + fs, h: boxes[k].h + fs };
    if (!boxes.some((o, j) => j !== k && hitBox(grown, o))) { const f = Math.min(fs * 1.1, Math.min(boxes[k].w, boxes[k].h) * .8); plan[k] = { t: 'num', f }; placed.push({ x: i.pl.x, y: i.pl.y, w: f * 1.3, h: f * 1.3 }); }
    else plan[k] = { t: 'out' };
  }
  for (const k of order) if (plan[k].t === 'out') { const { q, W, H } = placeOutside(k, items[k].p.name, placed); Object.assign(plan[k], { q, W, H }); placed.push({ x: q[0], y: q[1], w: W, h: H }); }
  const numItems = items.filter((_, k) => plan[k].t === 'num'), nums = new Map();
  [...new Map(numItems.map(i => [i.p.id, i.p])).values()].sort((a, b) => ORDER[a.source] - ORDER[b.source] || a.name.localeCompare(b.name, 'zh-Hant')).forEach((p, n) => nums.set(p.id, n + 1));
  const numList = [...nums.entries()].map(([id, n]) => ({ n, p: propOf(id), count: numItems.filter(i => i.p.id === id).length }));

  const hid = 'h' + (++hatchN);
  let g = '';
  for (let i = 1; i < w; i++) g += `<line x1="${i}" y1="0" x2="${i}" y2="${d}" stroke="#e5e7eb" stroke-width="${fs * 0.08}"/>`;
  for (let j = 1; j < d; j++) g += `<line x1="0" y1="${j}" x2="${w}" y2="${j}" stroke="#e5e7eb" stroke-width="${fs * 0.08}"/>`;
  g += `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${d}" stroke="#9ca3af" stroke-width="${fs * 0.1}" stroke-dasharray="${fs * .5} ${fs * .4}"/>`;
  g += `<rect x="0" y="0" width="${w}" height="${d}" fill="none" stroke="#374151" stroke-width="${fs * 0.2}"/>`;
  g += `<text x="0" y="${-fs * 2.1}" font-size="${fs * 1.1}" font-weight="600" fill="#111827">${esc(ev.name)}　${esc(ev.date || '')}</text>`;
  g += `<text x="0" y="${-fs * 0.8}" font-size="${fs * 1.1}" font-weight="600" fill="#7c3aed">${esc(sc ? sceneLabel(sc) : '')}</text>`;
  g += `<text x="${w}" y="${-fs * 0.8}" font-size="${fs}" fill="#6b7280" text-anchor="end">${esc(stageOf(ev.stageId).name)} ${w}×${d} m（後台）</text>`;
  g += `<text x="${w / 2}" y="${d + fs * 2.4}" font-size="${fs * 1.1}" fill="#6b7280" text-anchor="middle">▼ 觀眾席</text>`;
  const draw = [...order.filter(k => items[k].pl.id !== selId), ...order.filter(k => items[k].pl.id === selId)];   // 選取的畫在最上面，旋轉把手才點得到
  for (const k of draw) {
    const i = items[k], { pl } = i, act = i.p.source === 'actor', sel = pl.id === selId, fo = i.fo ?? (act ? .3 : .25);
    const geo = act ? `<ellipse rx="${i.sz.w / 2}" ry="${i.sz.d / 2}"` : `<rect x="${-i.sz.w / 2}" y="${-i.sz.d / 2}" width="${i.sz.w}" height="${i.sz.d}" rx="${fs * .15}"`;
    const stroke = sel ? '#7c3aed' : i.c, sw = fs * (sel ? .3 : .15), dash = sel ? ` stroke-dasharray="${fs * .4} ${fs * .3}"` : (i.dash ? ` stroke-dasharray="${fs * .55} ${fs * .3}"` : '');
    let handle = '';
    if (sel) { const rr = (w + 2 * m) * 0.03, ty = -i.sz.d / 2 - rr * 2.2;   // 旋轉把手：拖曳即可轉
      handle = `<line x1="0" y1="${-i.sz.d / 2}" x2="0" y2="${ty}" stroke="#7c3aed" stroke-width="${fs * .12}"/><circle class="rot" cx="0" cy="${ty}" r="${rr * 1.8}" fill="transparent"/><circle cx="0" cy="${ty}" r="${rr}" fill="#7c3aed" stroke="#fff" stroke-width="${fs * .1}" pointer-events="none"/>`; }
    g += `<g class="g" data-pid="${pl.id}" transform="translate(${pl.x} ${pl.y}) rotate(${pl.rot || 0})"><title>${esc(i.p.name)}</title>${geo} fill="${i.c}" fill-opacity="${fo}" stroke="${stroke}" stroke-width="${sw}"${dash}/>${i.hatch ? `${geo} fill="url(#${hid})" stroke="none" pointer-events="none"/>` : ''}${handle}</g>`;
  }
  for (const k of order) {
    const i = items[k], { x, y } = i.pl, p = plan[k]; TC = i.tc;
    if (p.t === 'in') { const ch = [...i.p.name], ls = Array.from({ length: p.rows }, (_, r) => ch.slice(r * p.per, (r + 1) * p.per).join('')).filter(Boolean); labels.push(ls.map((l, r) => textEl(l, x, y + (r - (ls.length - 1) / 2) * p.f * 1.15, p.f)).join('')); }
    else if (p.t === 'num') labels.push(textEl(String(nums.get(i.p.id)), x, y, p.f));
    else drawOut(k, p.q, p.W, p.H);
  }
  g += `<g class="lbls" pointer-events="none">${lines.join('')}${labels.join('')}</g>`;
  let extra = 0;
  if (opt.legend && numList.length) {                          // 匯出 PNG 時，把編號對照表也畫進圖裡
    const y0 = d + fs * 4.4; extra = numList.length * fs * 1.7 + fs;
    g += numList.map(({ n, p, count }, r) => { const yy = y0 + r * fs * 1.7, c = pal(p.source);
      return `<circle cx="${fs * .7}" cy="${yy}" r="${fs * .65}" fill="${c.c}"/><text x="${fs * .7}" y="${yy + fs * .35}" font-size="${fs * .9}" font-weight="600" text-anchor="middle" fill="#fff">${n}</text><text x="${fs * 1.7}" y="${yy + fs * .35}" font-size="${fs}" fill="#111827">${esc(p.name)}（${esc(p.source === 'theatre' ? '劇場' : p.owner || SRC[p.source].label)}）${count > 1 ? '×' + count : ''}</text>`; }).join('');
  }
  const vb = [-m, -fs * 3.4, w + 2 * m, d + fs * 7.4 + extra];
  const size = opt.px ? ` width="${opt.px}" height="${Math.round(opt.px * vb[3] / vb[2])}"` : '';
  const defs = items.some(i => i.hatch) ? `<defs><pattern id="${hid}" patternUnits="userSpaceOnUse" width="${fs * .45}" height="${fs * .45}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${fs * .45}" stroke="${pal('personal').c}" stroke-width="${fs * .09}"/></pattern></defs>` : '';
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}"${size} font-family="${FONT}">${defs}<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>${g}</svg>`, nums: numList, numMap: nums };
}
const stageSVG = (ev, sc, opt) => stageParts(ev, sc, opt).svg;
const numLegendHTML = nums => nums.length ? `<div class="muted" style="margin-top:6px">圖中以編號標示的小道具：</div><table class="numtbl"><tr><th>編號</th><th>道具</th><th>類別</th><th>提供者</th><th>數量</th></tr>${nums.map(({ n, p, count }) => `<tr><td>${numBadge(n, p)}</td><td>${esc(p.name)}</td><td>${SRC[p.source].label}</td><td>${esc(p.source === 'theatre' ? '劇場' : p.owner)}</td><td>${count}</td></tr>`).join('')}</table>` : '';
const numBadge = (n, p) => `<span class="num" style="background:${pal(p.source).c}">${n}</span>`;

/* ---------- 版面 ---------- */
function renderHeader() {
  const cb = document.getElementById('cloudBox');
  if (cb) cb.innerHTML = CFG && cloud.code ? `<span class="muted" title="${cloud.err ? esc(cloud.err) : ''}">☁ 班級 ${esc(cloud.code)}・${cloud.err ? '⚠ 無法存取雲端' : (!navigator.onLine || cloud.fromCache ? '連線中／離線' : '已同步')}</span> <button data-act="share" title="複製班級連結（同學點開就加入同一個班級）">分享班級</button> <button data-act="switch-code">換代碼</button>` : '';
  document.getElementById('tabs').hidden = !(ui.view === 'event' && curEvent());
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
}
function render() {
  if (ui.view === 'event' && !curEvent() && !(CFG && !cloud.ok) && !routeLoading()) ui.view = 'home';
  if (ui.view !== 'event' || ui.tab !== 'editor') ui.full = false;
  document.body.classList.toggle('noscroll', ui.full);
  renderHeader();
  const m = document.getElementById('main');
  if (routeLoading()) { m.innerHTML = '<div class="card empty">連線中…</div>'; return; }
  if (CFG && !cloud.ok) { m.innerHTML = `<div class="card empty">${cloud.err ? '無法連線到雲端：' + esc(cloud.err) : '連線中…'}</div>`; return; }
  if (ui.view === 'home') { m.innerHTML = renderHome(); syncUrl(); return; }
  m.innerHTML = eventBar() + ({ editor: renderEditor, props: renderProps, output: renderOutput })[ui.tab]();
  if (ui.tab === 'editor') { bindStage(); renderPropList(); }
  syncUrl();
}

/* ---------- 網址：每個事件（含分頁、場景）都有自己的網址，可分享、可上一頁 ---------- */
const TABS = ['editor', 'props', 'output'];
const parseHash = () => { const p = new URLSearchParams(location.hash.slice(1)); return { c: p.get('c'), e: p.get('e'), t: p.get('t'), s: p.get('s') }; };
function applyRoute(r) {
  if (r.e) { S.currentEventId = r.e; ui.view = 'event'; ui.tab = TABS.includes(r.t) ? r.t : 'editor'; ui.sceneId = r.s || null; } else ui.view = 'home';
  ui.sel = null;
}
let lastE = '';
/* 網址指定的事件還沒從伺服器確認前（快取可能是空的），不要誤判成「事件不存在」而跳回首頁 */
const routeLoading = () => CFG && ui.view === 'event' && !curEvent() && !cloud.server.events && !cloud.giveUp;
function routeHash() {
  const ev = ui.view === 'event' && curEvent(); if (!ev) return '';
  const p = new URLSearchParams({ e: ev.id, t: ui.tab }), sc = curScene(); if (sc && ui.tab === 'editor') p.set('s', sc.id);
  return '#' + p;
}
function syncUrl() {
  if (CFG && (!cloud.ok || routeLoading())) return;          // 雲端還在載入：先保留網址上的事件
  const h = routeHash(), ev = h ? curEvent().id : '';
  if (h !== location.hash) history[ev !== lastE ? 'pushState' : 'replaceState'](null, '', location.pathname + location.search + h);
  lastE = ev; lsSet(LAST_KEY, h);
}
window.addEventListener('popstate', () => { applyRoute(parseHash()); render(); });

/* ---------- 首頁：事件與舞台（上一層）---------- */
function renderHome() {
  const evs = S.events.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const cards = evs.length ? evs.map(e => { const st = stageOf(e.stageId), n = scenesOf(e.id).length;
    return `<div class="evcard"><div><b>${esc(e.name)}</b><div class="muted">${esc(e.date || '未定日期')}・${esc(st ? st.name + ' ' + st.w + '×' + st.d + 'm' : '（舞台已刪除）')}・${n} 個場景</div></div><button class="primary" data-act="ev-open" data-id="${e.id}">開啟</button></div>`; }).join('')
    : '<div class="muted">還沒有事件。一個「事件」＝一個呈現日期＋一個舞台；之後有新的演出日期或場地，再新增就好。</div>';
  return `<div class="card"><div class="toolbar"><h2 style="margin:0;flex:1">事件</h2><button class="primary" data-act="ev-new">＋ 新事件</button></div>${cards}</div>${renderStages()}`;
}
function eventBar() {
  const e = curEvent(), st = stageOf(e.stageId);
  return `<div class="card no-print crumb"><button class="small" data-act="home">← 所有事件</button><div class="crumbt"><b>${esc(e.name)}</b> <span class="muted">${esc(e.date || '未定日期')}・${esc(st ? st.name + ' ' + st.w + '×' + st.d + 'm' : '（舞台已刪除）')}</span></div>${CFG && cloud.code ? '<button class="small" data-act="share-ev">分享事件連結</button>' : ''}<button class="small" data-act="ev-edit">編輯事件</button><button class="small" data-act="ev-dup">複製事件</button><button class="small danger" data-act="ev-del">刪除事件</button></div>`;
}

/* ---------- 排列舞台 ---------- */
function sceneChipsHTML() {
  const ev = curEvent(), cs = curScene(), l = ev ? scenesOf(ev.id) : [];
  return l.length ? l.map((x, i) => `<button data-scene="${x.id}" class="${cs && cs.id === x.id ? 'on' : ''}">${i + 1}. ${esc(sceneLabel(x))}</button>`).join('') : '<span class="muted">尚無場景</span>';
}
function renderEditor() {
  const ev = curEvent();
  if (!ev) return `<div class="card empty">還沒有事件。<br>一個「事件」＝一個呈現日期＋一個舞台，之後有新的演出日期或場地，再新增就好。<br><br><button class="primary" data-act="ev-new">＋ 新事件</button></div>`;
  const sc = curScene();
  const bar = `<div class="card scenebar"><h3>場景（每人一個，順序＝出場順序）</h3><div class="chips" id="sceneChips">${sceneChipsHTML()}</div>
    <div class="toolbar"><button class="primary small" data-act="sc-new">＋ 新增場景</button><button class="small" data-act="sc-move" data-d="-1">◀ 前移</button><button class="small" data-act="sc-move" data-d="1">後移 ▶</button><button class="small" data-act="sc-edit">改名</button><button class="small" data-act="sc-dup">複製場景</button><button class="small danger" data-act="sc-del">刪除場景</button></div>
    <div class="muted">每位同學各自有一個場景（自己的舞台排法）。點名字切換；請只改自己的。</div></div>`;
  if (!sc) return bar + `<div class="card empty">這個事件還沒有場景。<br>請新增你自己的場景，就能開始排你的舞台。<br><br><button class="primary" data-act="sc-new">＋ 新增我的場景</button></div>`;
  return bar + `<div class="editor">
  <div>
    <div class="card"><h3>道具庫</h3>
      <input id="q" placeholder="搜尋道具／人名" value="${esc(ui.q)}" style="width:100%">
      <div class="chips" id="srcChips"></div>
      <div class="plist" id="plist"></div>
      <div class="muted" style="margin-top:6px">點「＋」放到舞台；同一道具可放多次，也可在多個場景、事件重複使用。找不到？到「道具庫」新增。</div>
    </div>
    <div class="card" id="selPanel"></div>
    <details class="card" id="placList"${ui.listOpen ? ' open' : ''}><summary id="placSum"></summary><div id="placBody"></div></details>
  </div>
  <div class="card stagewrap${ui.full ? ' full' : ''}">
    <div class="zoombar no-print"><button class="small" data-act="z-out" title="縮小">－</button><span id="zlabel">${Math.round(ui.zoom * 100)}%</span><button class="small" data-act="z-in" title="放大">＋</button><button class="small" data-act="z-fit">適合畫面</button><label class="palsel">配色<select data-pal><option value="bw"${ui.pal === 'bw' ? ' selected' : ''}>黑白友善</option><option value="color"${ui.pal === 'color' ? ' selected' : ''}>彩色</option></select></label><button class="small" data-act="z-full">${ui.full ? '✕ 離開全螢幕' : '⛶ 全螢幕'}</button></div>
    <div id="stageBox" style="--z:${ui.zoom}"></div>
    <div id="numLegend"></div>
    <div class="selTools no-print"><button class="small" data-act="pl-rot" data-d="-15">↺ 15°</button><button class="small" data-act="pl-rot" data-d="15">↻ 15°</button><button class="small" data-act="pl-rot" data-d="90">↻ 90°</button><button class="small" data-act="pl-dup">複製</button><button class="small danger" data-act="pl-del">移除</button>${nudgeHTML()}</div>
    <div class="legend">${Object.entries(SRC).map(([k, v]) => `<span><span class="dot ${k}"></span>${v.label}</span>`).join('')}<span class="muted">拖曳移動；拖紫色圓點旋轉；雙指或 Ctrl+滾輪縮放，拖空白處平移；方向鍵微調、R 旋轉、Delete 刪除</span></div>
  </div></div>`;
}
function renderPropList() {
  const chips = document.getElementById('srcChips'); if (!chips) return;
  chips.innerHTML = [['all', '全部'], ...Object.entries(SRC).map(([k, v]) => [k, v.label])].map(([k, l]) => `<button data-src="${k}" class="${ui.src === k ? 'on' : ''}">${l}</button>`).join('');
  const q = ui.q.trim().toLowerCase();
  const list = S.props.filter(p => (ui.src === 'all' || p.source === ui.src) && (!q || (p.name + p.owner).toLowerCase().includes(q)));
  document.getElementById('plist').innerHTML = list.length ? list.map(p => `<div class="prow"><span class="dot ${p.source}"></span><div class="nm"><b>${esc(p.name)}</b><span class="muted">${esc(ownerKey(p))}${p.source === 'actor' ? '' : '・' + p.w + '×' + p.d + 'm'}</span></div><button class="small" data-act="add-pl" data-id="${p.id}">＋</button></div>`).join('') : '<div class="muted">沒有符合的道具</div>';
}
function paintStage() {
  const ev = curEvent(), box = document.getElementById('stageBox'); if (!ev || !box) return;
  const parts = stageParts(ev, curScene(), { interactive: true }); box.innerHTML = parts.svg;
  const l = document.getElementById('numLegend'); if (l) l.innerHTML = numLegendHTML(parts.nums);
}
function renderStageBox() {
  const ev = curEvent(), box = document.getElementById('stageBox'); if (!ev || !box) return;
  paintStage();
  renderSelPanel();
}
/* ---- 場景中的道具清單：可選取、刪除；超出舞台的可移回 ---- */
const isOut = (pl, st) => st && (pl.x < 0 || pl.x > st.w || pl.y < 0 || pl.y > st.d);
function fitScenesToStage(eventId) {                         // 舞台尺寸或事件舞台改變後，把超出範圍的道具拉回邊界
  const ev = S.events.find(e => e.id === eventId), st = ev && stageOf(ev.stageId); let moved = 0; if (!st) return 0;
  for (const sc of S.scenes) if (sc.eventId === eventId) for (const pl of sc.placements) if (isOut(pl, st)) { pl.x = r2(Math.min(st.w, Math.max(0, pl.x))); pl.y = r2(Math.min(st.d, Math.max(0, pl.y))); moved++; }
  return moved;
}
function renderPlacList() {
  const sc = curScene(), body = document.getElementById('placBody'), sum = document.getElementById('placSum'); if (!body || !sum || !sc) return;
  const st = stageOf(curEvent().stageId), nOut = sc.placements.filter(p => isOut(p, st)).length, total = {}, k = {};
  sc.placements.forEach(p => total[p.propId] = (total[p.propId] || 0) + 1);
  sum.innerHTML = `場景中的道具（${sc.placements.length}）${nOut ? ` <span class="warn">⚠ ${nOut} 件超出舞台</span>` : ''}`;
  body.innerHTML = (nOut ? '<div class="toolbar"><button class="small primary" data-act="pl-allin">全部移回舞台</button></div>' : '') +
    (sc.placements.map(pl => {
      const p = propOf(pl.propId), n = (k[pl.propId] = (k[pl.propId] || 0) + 1), out = isOut(pl, st);
      return `<div class="prow plrow${ui.sel === pl.id ? ' sel' : ''}" data-plid="${pl.id}"><span class="dot ${p ? p.source : ''}"></span><div class="nm"><b>${esc(p ? p.name : '（已刪除的道具）')}${total[pl.propId] > 1 ? ' #' + n : ''}</b><span class="muted">X ${r2(pl.x)}・Y ${r2(pl.y)}${out ? ' <span class="warn">⚠ 超出舞台</span>' : ''}</span></div>${out ? `<button class="small" data-act="pl-in" data-plid="${pl.id}">移回</button>` : ''}<button class="small danger" data-act="pl-rm" data-plid="${pl.id}">刪除</button></div>`;
    }).join('') || '<div class="muted">（還沒有道具）</div>') + '<div class="muted" style="margin-top:6px">點一列可選取，再用上方的欄位或方向按鈕調整位置。</div>';
}
document.addEventListener('toggle', e => { if (e.target.id === 'placList') ui.listOpen = e.target.open; }, true);
function renderSelPanel() {
  renderPlacList();
  const sc = curScene(), el = document.getElementById('selPanel'); if (!el || !sc) return;
  const pl = sc.placements.find(x => x.id === ui.sel), p = pl && propOf(pl.propId);
  const counts = {}; sc.placements.forEach(x => counts[x.propId] = (counts[x.propId] || 0) + 1);
  const summary = `<div class="muted">這個場景共 ${sc.placements.length} 件（${Object.keys(counts).length} 種）</div>`;
  if (!pl || !p) { el.innerHTML = `<h3>選取的道具</h3><div class="muted">點選舞台上的道具來編輯。</div>${summary}`; return; }
  el.innerHTML = `<h3>${esc(p.name)} <span class="tag ${p.source}">${SRC[p.source].label}</span></h3>
  <div class="grid2">
    <label class="f">X（公尺，中心）<input type="number" step="0.01" data-pl="x" value="${r2(pl.x)}"></label>
    <label class="f">Y（由後台起算）<input type="number" step="0.01" data-pl="y" value="${r2(pl.y)}"></label>
    <label class="f">旋轉（度）<input type="number" step="15" data-pl="rot" value="${pl.rot || 0}"></label>
  </div>
  <div class="toolbar" style="margin-top:8px"><button class="small" data-act="pl-rot" data-d="-15">↺ 15°</button><button class="small" data-act="pl-rot" data-d="15">↻ 15°</button><button class="small" data-act="pl-rot" data-d="90">↻ 90°</button><button class="small" data-act="pl-dup">複製一份</button><button class="small danger" data-act="pl-del">從舞台移除</button></div>${nudgeHTML()}${summary}`;
}
function bindStage() { renderStageBox(); }

let drag = null;
/* 放得越大，拖曳與方向鍵的最小單位越小，方便微調 */
const snapStep = () => ui.zoom >= 4 ? 0.01 : ui.zoom >= 2 ? 0.02 : 0.05;
const nudgeHTML = () => `<div class="nudge no-print"><button class="small" data-act="nudge" data-dx="-1" data-dy="0">←</button><button class="small" data-act="nudge" data-dx="0" data-dy="-1">↑</button><button class="small" data-act="nudge" data-dx="0" data-dy="1">↓</button><button class="small" data-act="nudge" data-dx="1" data-dy="0">→</button><select data-nudge title="每次移動多少">${[[0.01, '1 公分'], [0.05, '5 公分'], [0.25, '25 公分']].map(([v, l]) => `<option value="${v}"${ui.nudge === v ? ' selected' : ''}>${l}</option>`).join('')}</select><button class="small" data-act="z-sel">🔍 放大到選取</button></div>`;
function focusSel() {                                         // 放大到選取的物件並置中
  const sc = curScene(), pl = sc?.placements.find(x => x.id === ui.sel), box = document.getElementById('stageBox'), st = stageOf(curEvent().stageId); if (!pl || !box) return;
  const p = propSize(propOf(pl.propId)), W = st.w + 2 * STAGE_M, fs = Math.max(st.w, st.d) * 0.025;
  setZoom(Math.min(10, Math.max(1, W / Math.max(2, Math.max(p.w, p.d) * 6))));
  const ppu = box.querySelector('svg').getBoundingClientRect().width / W;
  box.scrollLeft = (pl.x + STAGE_M) * ppu - box.clientWidth / 2; box.scrollTop = (pl.y + fs * 3.4) * ppu - box.clientHeight / 2;
}
/* ---- 縮放 / 平移 ---- */
function setZoom(z, cx, cy) {
  const box = document.getElementById('stageBox'); if (!box) return;
  z = Math.min(10, Math.max(1, z)); const r = box.getBoundingClientRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  const fx = (box.scrollLeft + cx - r.left) / box.scrollWidth, fy = (box.scrollTop + cy - r.top) / box.scrollHeight;
  ui.zoom = z; box.style.setProperty('--z', z);
  box.scrollLeft = fx * box.scrollWidth - (cx - r.left); box.scrollTop = fy * box.scrollHeight - (cy - r.top);
  const l = document.getElementById('zlabel'); if (l) l.textContent = Math.round(z * 100) + '%';
}
const pts = new Map(); let pan = null, pinch = null;
const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
function startPan(box) { const [p] = [...pts.values()]; pan = { x: p.x, y: p.y, sl: box.scrollLeft, st: box.scrollTop }; }
document.addEventListener('pointerdown', e => {
  const box = e.target.closest?.('#stageBox'); if (!box || e.target.closest('.g')) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); box.setPointerCapture?.(e.pointerId);
  if (pts.size === 1) { startPan(box); pinch = null; } else if (pts.size === 2) { pan = null; pinch = { d: dist(), z: ui.zoom }; }
});
document.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const box = document.getElementById('stageBox'); if (!box) return;
  if (pinch && pts.size >= 2) { const m = mid(); setZoom(pinch.z * dist() / pinch.d, m.x, m.y); }
  else if (pan) { box.scrollLeft = pan.sl - (e.clientX - pan.x); box.scrollTop = pan.st - (e.clientY - pan.y); }
});
const endPt = e => { if (!pts.delete(e.pointerId)) return; pinch = null; pan = null; const box = document.getElementById('stageBox'); if (pts.size === 1 && box) startPan(box); };
document.addEventListener('pointerup', endPt); document.addEventListener('pointercancel', endPt);
document.addEventListener('wheel', e => {
  if (!(e.ctrlKey || e.metaKey) || !e.target.closest?.('#stageBox')) return;
  e.preventDefault(); setZoom(ui.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
}, { passive: false });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.full) { ui.full = false; render(); } });
function svgPoint(svg, e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
function clampPl(pl) { const st = stageOf(curEvent().stageId); pl.x = Math.min(st.w, Math.max(0, r2(pl.x))); pl.y = Math.min(st.d, Math.max(0, r2(pl.y))); }
document.addEventListener('pointerdown', e => {
  const g = e.target.closest?.('#stageBox .g'); if (!g) return;
  const sc = curScene(), pl = sc?.placements.find(x => x.id === g.dataset.pid); if (!pl) return;
  if (e.target.closest('.rot') && ui.sel === pl.id) {
    drag = { rot: true, pl, g, svg: g.ownerSVGElement, moved: false };
    drag.svg.setPointerCapture?.(e.pointerId); e.preventDefault(); return;
  }
  ui.sel = pl.id; renderStageBox();
  const g2 = document.querySelector(`#stageBox .g[data-pid="${pl.id}"]`), svg = g2.ownerSVGElement, pt = svgPoint(svg, e);
  drag = { pl, g: g2, svg, dx: pl.x - pt.x, dy: pl.y - pt.y, moved: false };
  svg.setPointerCapture?.(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const pt = svgPoint(drag.svg, e); drag.moved = true;
  if (!drag.hid) { drag.hid = true; drag.svg.querySelector('.lbls')?.setAttribute('display', 'none'); }   // 拖曳中先隱藏標籤，放開後重畫
  if (drag.rot) {
    let a = Math.round(Math.atan2(pt.x - drag.pl.x, -(pt.y - drag.pl.y)) * 180 / Math.PI / 5) * 5; a = ((a % 360) + 360) % 360;
    drag.pl.rot = a; drag.g.setAttribute('transform', `translate(${drag.pl.x} ${drag.pl.y}) rotate(${a})`); return;
  }
  drag.pl.x = pt.x + drag.dx; drag.pl.y = pt.y + drag.dy;
  const sp = snapStep(); let nx = Math.round(drag.pl.x / sp) * sp, ny = Math.round(drag.pl.y / sp) * sp; drag.pl.x = nx; drag.pl.y = ny; clampPl(drag.pl);
  drag.g.setAttribute('transform', `translate(${drag.pl.x} ${drag.pl.y}) rotate(${drag.pl.rot || 0})`);
});
document.addEventListener('pointerup', () => {
  if (!drag) return; const m = drag.moved; drag = null; let n = 0;
  if (m) { n = save(); renderStageBox(); }
  flushStash(n);
});
document.addEventListener('keydown', e => {
  if (ui.tab !== 'editor' || !ui.sel || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const sc = curScene(), pl = sc?.placements.find(x => x.id === ui.sel); if (!pl) return;
  const step = e.shiftKey ? 0.25 : snapStep(); let used = true;
  if (e.key === 'ArrowLeft') pl.x -= step; else if (e.key === 'ArrowRight') pl.x += step;
  else if (e.key === 'ArrowUp') pl.y -= step; else if (e.key === 'ArrowDown') pl.y += step;
  else if (e.key === 'r' || e.key === 'R') pl.rot = (((pl.rot || 0) + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360;
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (confirm(`從舞台移除「${propOf(pl.propId)?.name || '這個道具'}」？`)) { sc.placements = sc.placements.filter(x => x !== pl); ui.sel = null; } }
  else used = false;
  if (used) { e.preventDefault(); if (ui.sel) clampPl(pl); save(); renderStageBox(); }
});

/* ---------- 道具庫 ---------- */
function renderProps() {
  const ep = S.props.find(p => p.id === ui.editProp) || { name: '', source: 'personal', owner: '', w: 0.5, d: 0.5, notes: '' };
  const owners = [...new Set(S.props.map(p => p.owner).filter(Boolean))];
  const usage = id => S.scenes.filter(sc => sc.placements.some(x => x.propId === id)).length;
  const groups = Object.keys(SRC).map(k => {
    const l = S.props.filter(p => p.source === k);
    return `<h3><span class="dot ${k}"></span>${SRC[k].label}（${l.length}）</h3>` + (l.length ? `<table><tr><th>名稱</th><th>提供者</th><th>尺寸 寬×深(m)</th><th>已用於</th><th></th></tr>${l.map(p => `<tr><td>${esc(p.name)}${p.notes ? `<div class="muted">${esc(p.notes)}</div>` : ''}</td><td>${esc(p.source === 'theatre' ? '劇場' : p.owner)}</td><td>${sizeText(p)}</td><td>${usage(p.id)} 個場景</td><td style="white-space:nowrap"><button class="small" data-act="edit-prop" data-id="${p.id}">編輯</button> <button class="small danger" data-act="del-prop" data-id="${p.id}">刪除</button></td></tr>`).join('')}</table>` : '<div class="muted">（無）</div>');
  }).join('');
  return `<div class="card"><h2>${ui.editProp ? '編輯道具' : '新增道具'}</h2>
  <form data-form="prop"><div class="grid2">
    <label class="f">名稱<input name="name" required value="${esc(ep.name)}" placeholder="例：椅子、吉他、阿花"></label>
    <label class="f">類別<select name="source">${Object.entries(SRC).map(([k, v]) => `<option value="${k}"${ep.source === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <label class="f">提供者／演員姓名（劇場提供可留空）<input name="owner" list="owners" value="${esc(ep.owner)}"></label>
    <label class="f sizef"${ep.source === 'actor' ? ' hidden' : ''}>寬（公尺，左右）<input name="w" type="number" step="0.05" min="0.05" value="${ep.w}"></label>
    <label class="f sizef"${ep.source === 'actor' ? ' hidden' : ''}>深（公尺，前後）<input name="d" type="number" step="0.05" min="0.05" value="${ep.d}"></label>
    <label class="f">備註<input name="notes" value="${esc(ep.notes)}"></label>
  </div><datalist id="owners">${owners.map(o => `<option value="${esc(o)}">`).join('')}</datalist>
  <div class="row-btn" style="margin-top:10px"><button class="primary">${ui.editProp ? '儲存' : '新增'}</button> ${ui.editProp ? '<button type="button" data-act="cancel-prop">取消</button>' : ''}</div></form></div>
  <div class="card"><h2>全部道具（可跨事件重複使用）</h2>${groups}</div>`;
}

/* ---------- 舞台規格 ---------- */
function renderStages() {
  const es = stageOf(ui.editStage) || { name: '', w: 8, d: 6, notes: '' };
  return `<div class="card"><h2>${ui.editStage ? '編輯舞台' : '新增舞台規格'}</h2>
  <form data-form="stage"><div class="grid2">
    <label class="f">場地／舞台名稱<input name="name" required value="${esc(es.name)}" placeholder="例：某某劇場 主舞台"></label>
    <label class="f">寬（公尺，左右）<input name="w" type="number" step="0.1" min="1" value="${es.w}"></label>
    <label class="f">深（公尺，前後）<input name="d" type="number" step="0.1" min="1" value="${es.d}"></label>
    <label class="f">備註<input name="notes" value="${esc(es.notes)}" placeholder="側台、樓梯、鋼琴位置…"></label>
  </div><div style="margin-top:10px"><button class="primary">${ui.editStage ? '儲存' : '新增'}</button> ${ui.editStage ? '<button type="button" data-act="cancel-stage">取消</button>' : ''}</div></form></div>
  <div class="card"><h2>已有的舞台</h2><table><tr><th>名稱</th><th>寬×深 (m)</th><th>備註</th><th>使用中</th><th></th></tr>${S.stages.map(s => `<tr><td>${esc(s.name)}</td><td>${s.w}×${s.d}</td><td>${esc(s.notes)}</td><td>${S.events.filter(e => e.stageId === s.id).length} 個事件</td><td style="white-space:nowrap"><button class="small" data-act="edit-stage" data-id="${s.id}">編輯</button> <button class="small danger" data-act="del-stage" data-id="${s.id}">刪除</button></td></tr>`).join('')}</table></div>`;
}

/* ---------- 輸出 ---------- */
const ORDER = { theatre: 0, personal: 1, actor: 2 };
function rowsFor(scs) {
  const map = new Map();
  for (const sc of scs) for (const pl of sc.placements) {
    const p = propOf(pl.propId); if (!p) continue;
    const r = map.get(p.id) || { p, n: 0, users: new Set() }; r.n++; r.users.add(sc.owner || '（未命名）'); map.set(p.id, r);
  }
  return [...map.values()].sort((a, b) => ORDER[a.p.source] - ORDER[b.p.source] || ownerKey(a.p).localeCompare(ownerKey(b.p), 'zh-Hant') || a.p.name.localeCompare(b.p.name, 'zh-Hant'));
}
const tableHTML = (rows, users, nm) => rows.length ? `<table><tr>${nm ? '<th>編號</th>' : ''}<th>道具</th><th>類別</th><th>提供者</th><th>尺寸 (m)</th><th>數量</th>${users ? '<th>使用場景</th>' : ''}</tr>${rows.map(({ p, n, users: u }) => `<tr>${nm ? `<td>${nm.has(p.id) ? numBadge(nm.get(p.id), p) : '—'}</td>` : ''}<td>${esc(p.name)}</td><td>${SRC[p.source].label}</td><td>${esc(ownerKey(p))}</td><td>${sizeText(p)}</td><td>${n}</td>${users ? `<td>${esc([...u].join('、'))}</td>` : ''}</tr>`).join('')}</table>` : '<div class="muted">（沒有道具）</div>';
const scenePage = (ev, sc, brk) => { const parts = stageParts(ev, sc); return `<div class="pg ${brk ? 'pg-break' : ''}"><h2>${esc(sceneLabel(sc))} 的道具</h2>${tableHTML(rowsFor([sc]), false, parts.numMap)}<div>${parts.svg}</div></div>`; };
function renderOutput() {
  const ev = curEvent();
  if (!ev) return '<div class="card empty">請先建立事件。</div>';
  const scs = scenesOf(ev.id);
  if (ui.outScene !== '__all' && !scs.some(x => x.id === ui.outScene)) ui.outScene = '__all';
  const all = ui.outScene === '__all', one = scs.find(x => x.id === ui.outScene);
  let body;
  if (!scs.length) body = '<div class="muted">這個事件還沒有場景。</div>';
  else if (!all) body = scenePage(ev, one, false);
  else body = `<div class="pg"><h2>全班道具總清單</h2>${tableHTML(rowsFor(scs), true)}</div>` +
    scs.map(x => ui.group ? scenePage(ev, x, true) : (() => { const pt = stageParts(ev, x); return `<div class="pg"><h2>${esc(sceneLabel(x))}・舞台俯視圖</h2>${pt.svg}${numLegendHTML(pt.nums)}</div>`; })()).join('');
  return `<div class="card no-print"><div class="toolbar">
    <label>顯示：<select id="sceneSel"><option value="__all">全班（總清單）</option>${scs.map(x => `<option value="${x.id}"${x.id === ui.outScene ? ' selected' : ''}>${esc(sceneLabel(x))}</option>`).join('')}</select></label>
    ${all ? `<label><input type="checkbox" id="groupChk"${ui.group ? ' checked' : ''}> 每人一頁（各自清單＋俯視圖）</label>` : ''}
    <label>配色<select data-pal><option value="bw"${ui.pal === 'bw' ? ' selected' : ''}>黑白友善</option><option value="color"${ui.pal === 'color' ? ' selected' : ''}>彩色</option></select></label>
    <button class="primary" data-act="print">列印 / 存成 PDF</button>
    <button data-act="png">下載俯視圖 PNG${all ? '（每人一張）' : ''}</button>
    <button data-act="csv">下載清單 CSV</button></div></div>
  <div class="card sheet"><h1 style="margin:0 0 2px;font-size:20px">${esc(ev.name)}</h1><div class="muted">${esc(ev.date || '')}　${esc(stageOf(ev.stageId)?.name || '')} ${stageOf(ev.stageId)?.w}×${stageOf(ev.stageId)?.d} m</div>${body}</div>`;
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const fileBase = ev => `${ev.date || 'event'}_${ev.name}`.replace(/[\\/:*?"<>|\s]+/g, '_');
const outScenes = ev => ui.outScene === '__all' ? scenesOf(ev.id) : scenesOf(ev.id).filter(x => x.id === ui.outScene);
function svgToPNG(svg, name) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
      c.toBlob(b => { download(name, b); setTimeout(res, 400); });
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
async function exportPNG() {
  const ev = curEvent();
  for (const x of outScenes(ev)) await svgToPNG(stageSVG(ev, x, { px: 1800, legend: true }), `${fileBase(ev)}_${x.owner || '場景'}.png`);
}
function exportCSV() {
  const ev = curEvent(), q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['場景（人）', '曲目／備註', '道具', '類別', '提供者', '寬(m)', '深(m)', '數量', '備註'].map(q).join(',')];
  for (const x of outScenes(ev)) for (const { p, n } of rowsFor([x])) lines.push([x.owner, x.title, p.name, SRC[p.source].label, ownerKey(p), p.source === 'actor' ? '' : p.w, p.source === 'actor' ? '' : p.d, n, p.notes].map(q).join(','));
  download(`${fileBase(ev)}_道具清單${ui.outScene === '__all' ? '' : '_' + (outScenes(ev)[0]?.owner || '')}.csv`, new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' }));
}

/* ---------- 對話框（事件） ---------- */
function eventDialog(mode) {
  const cur = curEvent();
  if (mode === 'edit' && !cur) return;
  const e = mode === 'edit' ? cur : { name: '', date: new Date().toISOString().slice(0, 10), stageId: S.stages[0]?.id };
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<form method="dialog" id="evForm"><h3>${mode === 'edit' ? '編輯事件' : '新事件'}</h3>
  <label class="f">事件名稱<input name="name" required value="${esc(e.name)}" placeholder="例：期末發表會"></label><br>
  <label class="f">呈現日期<input name="date" type="date" required value="${esc(e.date)}"></label><br>
  <label class="f">舞台<select name="stage">${S.stages.map(s => `<option value="${s.id}"${s.id === e.stageId ? ' selected' : ''}>${esc(s.name)}（${s.w}×${s.d}m）</option>`).join('')}</select></label>
  <div class="muted">沒有適合的舞台？先到「舞台規格」新增。</div>
  <div class="row"><button type="button" onclick="dlg.close()">取消</button><button class="primary" value="ok">${mode === 'edit' ? '儲存' : '建立'}</button></div></form>`;
  dlg.showModal();
  document.getElementById('evForm').onsubmit = ev => {
    const f = new FormData(ev.target);
    if (mode === 'edit') { Object.assign(cur, { name: f.get('name'), date: f.get('date'), stageId: f.get('stage') }); const mv = fitScenesToStage(cur.id); if (mv) setTimeout(() => alert(`換了舞台後，有 ${mv} 件道具超出範圍，已移回舞台邊緣。`), 0); }
    else { const n = { id: uid(), name: f.get('name'), date: f.get('date'), stageId: f.get('stage'), migrated: true }; S.events.push(n); S.currentEventId = n.id; ui.sel = null; ui.sceneId = null; ui.view = 'event'; ui.tab = 'editor'; }
    save(); render();
  };
}

function sceneDialog(mode) {
  const ev = curEvent(), cur = curScene(); if (!ev || (mode === 'edit' && !cur)) return;
  const e = mode === 'edit' ? cur : { owner: lsGet(ME_KEY) || '', title: '' };
  const names = [...new Set([...S.scenes.map(x => x.owner), ...S.props.map(p => p.owner)].filter(Boolean))];
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<form id="scForm"><h3>${mode === 'edit' ? '修改場景' : '新增場景'}</h3>
  <label class="f">誰的場景（姓名）<input name="owner" required list="scNames" value="${esc(e.owner)}" placeholder="例：小明"></label><br>
  <label class="f">曲目／備註（選填）<input name="title" value="${esc(e.title)}" placeholder="例：《月亮代表我的心》"></label>
  <datalist id="scNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  <div class="row"><button type="button" onclick="dlg.close()">取消</button><button class="primary">${mode === 'edit' ? '儲存' : '建立'}</button></div></form>`;
  dlg.showModal();
  document.getElementById('scForm').onsubmit = f => {
    f.preventDefault(); const fd = new FormData(f.target), owner = fd.get('owner').trim(), title = fd.get('title').trim(); dlg.close();
    if (mode === 'edit') Object.assign(cur, { owner, title });
    else { const n = { id: uid(), eventId: ev.id, owner, title, t: Date.now(), placements: [] }; S.scenes.push(n); ui.sceneId = n.id; lsSet(ME_KEY, owner); }
    ui.sel = null; save(); render();
  };
}

/* ---------- 事件委派 ---------- */
document.addEventListener('click', e => {
  const row = e.target.closest('.plrow');
  if (row && !e.target.closest('button')) { ui.sel = row.dataset.plid; renderStageBox(); document.getElementById('stageBox')?.scrollIntoView({ block: 'nearest' }); return; }
  const t = e.target.closest('[data-act],[data-tab],[data-src],[data-scene]'); if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; return render(); }
  if (t.dataset.scene) { ui.sceneId = t.dataset.scene; ui.sel = null; return render(); }
  if (t.dataset.src) { ui.src = t.dataset.src; return renderPropList(); }
  const ev = curEvent(), sc = curScene(), id = t.dataset.id;
  switch (t.dataset.act) {
    case 'home': e.preventDefault(); ui.view = 'home'; ui.sel = null; return render();
    case 'ev-open': ui.zoom = 1; ui.full = false; S.currentEventId = id; ui.view = 'event'; ui.tab = 'editor'; ui.sceneId = null; ui.sel = null; save(); return render();
    case 'ev-new': if (!S.stages.length) { alert('請先在下方新增舞台規格'); return; } return eventDialog('new');
    case 'ev-edit': return eventDialog('edit');
    case 'ev-dup': if (!ev) return; { const n = JSON.parse(JSON.stringify(ev)); n.id = uid(); n.name += '（複製）'; n.migrated = true; S.events.push(n);
      for (const x of scenesOf(ev.id)) { const c = JSON.parse(JSON.stringify(x)); c.id = uid(); c.eventId = n.id; c.placements.forEach(p => p.id = uid()); S.scenes.push(c); }
      S.currentEventId = n.id; ui.sceneId = null; ui.view = 'event'; save(); return render(); }
    case 'ev-del': if (ev && confirm(`刪除事件「${ev.name}」？\n底下 ${scenesOf(ev.id).length} 個場景（所有人的排法）會一併刪除，且無法復原。\n（道具庫與舞台規格不受影響）`)) { S.events = S.events.filter(x => x !== ev); S.scenes = S.scenes.filter(x => x.eventId !== ev.id); S.currentEventId = null; ui.view = 'home'; ui.sel = null; save(); render(); } return;
    case 'add-pl': { if (!sc) return alert('請先新增你的場景'); const st = stageOf(ev.stageId); const n = sc.placements.length; const pl = { id: uid(), t: Date.now(), propId: id, x: r2(st.w / 2 + (n % 5 - 2) * 0.3), y: r2(st.d / 2 + (n % 5 - 2) * 0.3), rot: 0 }; sc.placements.push(pl); ui.sel = pl.id; save(); return renderStageBox(); }
    case 'pl-rot': { const pl = sc?.placements.find(x => x.id === ui.sel); if (pl) { pl.rot = (((pl.rot || 0) + (+t.dataset.d || 90)) % 360 + 360) % 360; save(); renderStageBox(); } return; }
    case 'pl-dup': { const pl = sc?.placements.find(x => x.id === ui.sel); if (pl) { const n = { ...pl, id: uid(), t: Date.now(), x: pl.x + .3, y: pl.y + .3 }; clampPl(n); sc.placements.push(n); ui.sel = n.id; save(); renderStageBox(); } return; }
    case 'pl-del': { const pl = sc?.placements.find(x => x.id === ui.sel); if (!pl || !confirm(`從舞台移除「${propOf(pl.propId)?.name || '這個道具'}」？`)) return; sc.placements = sc.placements.filter(x => x !== pl); ui.sel = null; save(); return renderStageBox(); }
    case 'edit-prop': ui.editProp = id; return render();
    case 'cancel-prop': ui.editProp = null; return render();
    case 'del-prop': { const used = S.scenes.filter(x => x.placements.some(p => p.propId === id)).length; if (confirm(`刪除道具「${propOf(id).name}」？無法復原。` + (used ? `\n它會同時從 ${used} 個場景的舞台上移除。` : ''))) { S.props = S.props.filter(p => p.id !== id); S.scenes.forEach(x => x.placements = x.placements.filter(p => p.propId !== id)); save(); render(); } return; }
    case 'edit-stage': ui.editStage = id; return render();
    case 'cancel-stage': ui.editStage = null; return render();
    case 'del-stage': { if (S.events.some(x => x.stageId === id)) return alert('有事件正在使用這個舞台，無法刪除。'); if (!confirm(`刪除舞台「${stageOf(id)?.name}」？無法復原。`)) return; S.stages = S.stages.filter(s => s.id !== id); save(); return render(); }
    case 'sc-new': return sceneDialog('new');
    case 'sc-move': { if (!sc) return; const l = scenesOf(ev.id), i = l.indexOf(sc), j = i + (+t.dataset.d); if (j < 0 || j >= l.length) return;
      l.splice(i, 1); l.splice(j, 0, sc); l.forEach((x, k) => x.t = (k + 1) * 1000); save(); return render(); }
    case 'sc-edit': return sceneDialog('edit');
    case 'sc-dup': if (!sc) return; { const c = JSON.parse(JSON.stringify(sc)); c.id = uid(); c.t = Date.now(); c.owner += '（複製）'; c.placements.forEach(p => p.id = uid()); S.scenes.push(c); ui.sceneId = c.id; ui.sel = null; save(); return render(); }
    case 'sc-del': if (sc && confirm(`刪除場景「${sceneLabel(sc)}」？\n裡面 ${sc.placements.length} 件道具的排法會一併刪除，且無法復原。`)) { S.scenes = S.scenes.filter(x => x !== sc); ui.sceneId = null; ui.sel = null; save(); render(); } return;
    case 'nudge': { const pl = sc?.placements.find(x => x.id === ui.sel); if (!pl) return; pl.x += +t.dataset.dx * ui.nudge; pl.y += +t.dataset.dy * ui.nudge; clampPl(pl); save(); return renderStageBox(); }
    case 'z-sel': return focusSel();
    case 'pl-in': { const pl = sc?.placements.find(x => x.id === t.dataset.plid); if (!pl) return; ui.sel = pl.id; clampPl(pl); save(); return renderStageBox(); }
    case 'pl-allin': { if (!sc) return; sc.placements.forEach(clampPl); save(); return renderStageBox(); }
    case 'pl-rm': { const pl = sc?.placements.find(x => x.id === t.dataset.plid); if (!pl || !confirm(`從舞台移除「${propOf(pl.propId)?.name || '這個道具'}」？`)) return; sc.placements = sc.placements.filter(x => x !== pl); if (ui.sel === pl.id) ui.sel = null; save(); return renderStageBox(); }
    case 'z-in': return setZoom(ui.zoom * 1.25);
    case 'z-out': return setZoom(ui.zoom / 1.25);
    case 'z-fit': { setZoom(1); const b = document.getElementById('stageBox'); if (b) { b.scrollLeft = 0; b.scrollTop = 0; } return; }
    case 'z-full': ui.full = !ui.full; return render();
    case 'print': return window.print();
    case 'png': return exportPNG();
    case 'csv': return exportCSV();
    case 'share': case 'share-ev': {                          // 分享連結只帶 班級代碼(c)＋事件(e)；分頁、場景請直接複製網址列
      const ev0 = t.dataset.act === 'share-ev' ? curEvent() : null;
      const url = location.origin + location.pathname + '#c=' + encodeURIComponent(cloud.code) + (ev0 ? '&e=' + encodeURIComponent(ev0.id) : '');
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => alert((ev0 ? '已複製「這個事件」的連結' : '已複製班級連結') + '，貼給同學即可直接加入：\n' + url), () => prompt('複製這個連結給同學：', url)); return; }
    case 'switch-code': return askCode(true).then(c => { if (c && c !== cloud.code) { lsSet(CODE_KEY, c); location.reload(); } });
  }
});
document.addEventListener('submit', e => {
  const k = e.target.dataset?.form; if (!k) return; e.preventDefault();
  const f = new FormData(e.target);
  if (k === 'prop') {
    const o = { name: f.get('name').trim(), source: f.get('source'), owner: f.get('owner').trim(), w: num(f.get('w'), .5), d: num(f.get('d'), .5), notes: f.get('notes').trim() };
    if (o.source === 'theatre') o.owner = '';
    if (o.source === 'actor') { o.w = ACTOR; o.d = ACTOR; }
    if (ui.editProp) Object.assign(propOf(ui.editProp), o); else S.props.push({ id: uid(), ...o });
    ui.editProp = null;
  } else {
    const o = { name: f.get('name').trim(), w: num(f.get('w'), 8), d: num(f.get('d'), 6), notes: f.get('notes').trim() };
    if (ui.editStage) {
      const sid = ui.editStage; Object.assign(stageOf(sid), o);
      const mv = S.events.filter(e => e.stageId === sid).reduce((n, e) => n + fitScenesToStage(e.id), 0);
      if (mv) setTimeout(() => alert(`舞台尺寸改小了，有 ${mv} 件道具超出範圍，已自動移回舞台邊緣。`), 0);
    } else S.stages.push({ id: uid(), ...o });
    ui.editStage = null;
  }
  save(); render();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { ui.q = t.value; renderPropList(); }
  if (t.dataset.pl) {
    const pl = curScene()?.placements.find(x => x.id === ui.sel); if (!pl) return;
    pl[t.dataset.pl] = parseFloat(t.value) || 0; if (t.dataset.pl !== 'rot') clampPl(pl);
    save(); paintStage();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'source' && t.form?.dataset.form === 'prop') t.form.querySelectorAll('.sizef').forEach(el => el.hidden = t.value === 'actor');
  if (t.dataset.pal !== undefined) { ui.pal = t.value; lsSet(PAL_KEY, t.value); render(); return; }
  if (t.dataset.nudge !== undefined) ui.nudge = parseFloat(t.value);
  if (t.id === 'sceneSel') { ui.outScene = t.value; render(); }
  if (t.id === 'groupChk') { ui.group = t.checked; render(); }
});
/* ---------- 雲端（Firebase）---------- */
const validCode = c => /^[A-Za-z0-9_-]{6,40}$/.test(c || '');
function askCode(cancelable) {
  return new Promise(resolve => {
    const dlg = document.getElementById('dlg');
    dlg.innerHTML = `<form id="codeForm"><h3>班級共用代碼</h3>
      <div class="muted">同班同學輸入同一組代碼，就會看到同一份資料。代碼等於密碼，請只告訴同學。</div><br>
      <label class="f">代碼（6～40 個英文字母、數字、- 或 _）<input name="code" required minlength="6" maxlength="40" pattern="[A-Za-z0-9_\\-]{6,40}" autocomplete="off" autocapitalize="off" placeholder="例：sing2026-abc"></label>
      <div class="row">${cancelable ? '<button type="button" id="codeCancel">取消</button>' : ''}<button class="primary">進入</button></div></form>`;
    dlg.oncancel = e => { if (!cancelable) e.preventDefault(); else resolve(null); };
    dlg.showModal();
    document.getElementById('codeForm').onsubmit = e => { e.preventDefault(); const c = new FormData(e.target).get('code').trim(); if (!validCode(c)) return; dlg.close(); resolve(c); };
    const cc = document.getElementById('codeCancel'); if (cc) cc.onclick = () => { dlg.close(); resolve(null); };
  });
}
function applyRemote(name, docs) {
  if (drag) { cloud.stash[name] = docs; return; }            // 拖曳中先不動畫面，放開後再套用
  S[name] = cloud.diff.fromDocs(name, docs);
  cloud.remote[name] = JSON.parse(JSON.stringify(S[name]));
}
function flushStash(wrote) {
  const st = cloud.stash; cloud.stash = {}; let any = false;
  for (const [name, docs] of Object.entries(st)) { if (name === 'scenes' && wrote) continue; applyRemote(name, docs); any = true; }
  if (any) refreshRemote();
}
function onData(name, docs, fromCache) {
  cloud.fromCache = fromCache; cloud.got[name] = true; cloud.err = null; if (!fromCache) cloud.server[name] = true;
  applyRemote(name, docs);
  if (!cloud.ok) {
    if (!['stages', 'props', 'events', 'scenes'].every(k => cloud.got[k])) return;
    cloud.ok = true; maybeMigrate(); if (migrateLegacy()) save(); render(); return;
  }
  if (migrateLegacy()) save();
  refreshRemote();
}
let warned = false;
function onError(err) {
  console.error(err); cloud.err = err.code || err.message;
  if (err.code === 'permission-denied' && !warned) { warned = true; alert('雲端拒絕存取：請確認 Firestore 的安全規則已依 SETUP.md 設定。'); }
  if (!cloud.ok) render(); else renderHeader();
}
/* 遠端有更新時只重畫必要的部分，避免打斷正在輸入的欄位 */
function refreshRemote() {
  renderHeader();
  const act = document.activeElement, inForm = !!act?.closest?.('main form, #selPanel');
  if (ui.view === 'home') { if (!inForm) render(); return; }
  if (!curEvent()) { render(); return; }
  if (ui.tab === 'editor') {
    const box = document.getElementById('stageBox');
    if (!curEvent() || !curScene() || !box) { if (!inForm) render(); return; }
    const chips = document.getElementById('sceneChips'); if (chips) chips.innerHTML = sceneChipsHTML();
    paintStage(); renderPropList();
    if (!act?.closest?.('#selPanel')) renderSelPanel();
  } else if (!inForm) render();
}
function maybeMigrate() {                                    // 雲端是空的、這台瀏覽器有舊資料 → 問要不要上傳
  if (S.stages.length || S.props.length || S.events.length || S.scenes.length) return;
  const flag = 'stage-props-asked-' + cloud.code; if (lsGet(flag)) return; lsSet(flag, '1');
  if (!legacy || !(legacy.events?.length || legacy.props?.length > 4 || legacy.stages?.length > 1)) return;
  if (confirm('雲端還沒有任何資料。要把這台瀏覽器裡原本的資料上傳到班級共用嗎？')) {
    S.stages = legacy.stages || []; S.props = legacy.props || []; S.events = legacy.events || []; S.scenes = legacy.scenes || []; S.currentEventId = legacy.currentEventId || null; migrateLegacy(); save();
  }
}
async function boot() {
  let r = parseHash();
  if (!r.e) { const l = lsGet(LAST_KEY); if (l) { const p = new URLSearchParams(l.slice(1)); r = { ...r, e: p.get('e'), t: p.get('t'), s: p.get('s') }; } }   // 直接開網站：回到上次所在的事件
  applyRoute(r); lastE = r.e || '';
  if (!CFG && migrateLegacy()) save();
  if (r.c) { const p = new URLSearchParams(location.hash.slice(1)); p.delete('c'); history.replaceState(null, '', location.pathname + location.search + (p.toString() ? '#' + p : '')); }
  render();
  if (!CFG) return;
  let code = r.c;
  if (!validCode(code)) code = lsGet(CODE_KEY);
  if (!validCode(code)) code = await askCode(false);
  lsSet(CODE_KEY, code); cloud.code = code; renderHeader();
  window.addEventListener('online', renderHeader); window.addEventListener('offline', renderHeader);
  try {
    const [api, diff] = await Promise.all([import('./sync.js'), import('./diff.js')]);
    cloud.diff = diff; cloud.api = api.connect(CFG, code, { onData, onError });
    setTimeout(() => { cloud.giveUp = true; if (cloud.ok) { render(); return; } if (!cloud.err) { cloud.err = '連線逾時：請確認 Firebase 已建立 Firestore Database（位置選 asia-east1）、規則已發布，且網路沒有擋 firestore.googleapis.com'; render(); } }, 12000);
  } catch (e) { onError(e); }
}
boot();
