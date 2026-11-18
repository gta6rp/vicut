// VICUT's live room: one cut room watching one stream, as it works. Ported from cutroom's /live board (the stream a few
// seconds behind live, what the room hears, the signal, the editor's call, the cut list), without cutroom's money,
// posting and operator paths. Which room: ?s=<slug>, else the room on air with the biggest audience.
import { API, esc, fmtNum, clean, INTERNAL, get, roomHref } from './common.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.mjs';
const S = { slug: null, base: '', run: null, state: null, clips: new Map(), lines: [], log: [], hls: null };
const hms = (t) => { t = Math.max(0, Math.floor(t || 0)); return [t / 3600, (t / 60) % 60, t % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':'); };
const ms = (t) => { t = Math.max(0, Math.round(t || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

const STAGES = [['queued', 'Found', 'found'], ['judging', 'Editor', 'judging'], ['cutting', 'Cut', 'cutting'], ['ready', 'Ready', 'ready']];
const ORDER = { queued: 0, judging: 1, cutting: 2, ready: 3, posting: 3, posted: 3, submitted: 3, paid: 3, dropped: -1, hidden: -1, failed: -2 };
const isCut = (c) => ORDER[c.stage] >= 3;
const dropped = (c) => ['dropped', 'failed', 'hidden'].includes(c.stage);
// the editor's reason, as a visitor reads it: an internal failure ("editor unavailable") is no call, so it shows as a pass
const why = (c) => { const w = clean(String(c.why || '').replace(/^dropped by the editor:\s*/i, '').replace(/\s*\((?:hook replaced|kept: the room)[^)]*\)/g, '')); return INTERNAL.test(w) ? '' : w; };

// ---------- the platform: our own copy of the stream (Kick, via the room's relay) a few seconds behind, else its player ----------
const isTwitch = (m) => m.platform === 'twitch' || /twitch\.tv\//.test(m.credit || '');
const platName = (m) => (isTwitch(m) ? 'Twitch' : 'Kick');
const homeUrl = (m) => (isTwitch(m) ? `https://www.twitch.tv/${encodeURIComponent(m.slug)}` : `https://kick.com/${encodeURIComponent(m.slug)}`);
const homeText = (m) => (isTwitch(m) ? `twitch.tv/${m.slug || ''}` : `kick.com/${m.slug || ''}`);
const ICON = {
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.8 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
const muteBtn = (cls = '') => `<button type="button" class="lv-mute ${cls}" data-muted="1" aria-label="Unmute" title="Unmute">${ICON.off}<span class="lv-mute-t">Muted</span></button>`;
const CONTROLS = `<div class="lv-ctrl">${muteBtn()}<input class="lv-vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
  <button type="button" class="lv-fs" aria-label="Full screen" title="Full screen">${ICON.fs}</button></div>`;
const boxOf = (el) => el.closest('.lv-screen, .lt-phone');
function syncMute(v) {
  const box = boxOf(v); const b = box?.querySelector('.lv-mute'); if (!b) return;
  const off = v.muted || v.volume === 0;
  b.dataset.muted = off ? '1' : '0'; b.setAttribute('aria-label', off ? 'Unmute' : 'Mute'); b.title = off ? 'Unmute' : 'Mute';
  b.innerHTML = (off ? ICON.off : ICON.on) + (off ? '<span class="lv-mute-t">Muted</span>' : '');
  const r = box.querySelector('.lv-vol'); if (r) r.value = off ? 0 : v.volume;
}
document.addEventListener('volumechange', (e) => { if (e.target.tagName === 'VIDEO') syncMute(e.target); }, true);
function soundOn(v, on) {
  if (on) for (const o of document.querySelectorAll('video')) if (o !== v && !o.muted) o.muted = true;   // one sound at a time
  v.muted = !on; if (on && v.volume === 0) v.volume = 1;
  if (on) v.play().catch(() => {});
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.lv-mute, .lv-fs');
  const box = b ? boxOf(b) : e.target.matches('.lv-screen video.lv-player, .lt-phone video') ? boxOf(e.target) : null;
  const v = box?.querySelector('video'); if (!v) return;
  if (b?.classList.contains('lv-fs')) { (document.fullscreenElement ? document.exitFullscreen() : (box.requestFullscreen || box.webkitRequestFullscreen).call(box))?.catch?.(() => {}); return; }
  soundOn(v, v.muted || v.volume === 0);
});
document.addEventListener('input', (e) => {
  if (!e.target.matches('.lv-vol')) return;
  const v = boxOf(e.target)?.querySelector('video'); if (!v) return;
  const x = +e.target.value; if (x > 0) { soundOn(v, true); v.volume = x; } else v.muted = true;
});
function streamIframe(scr, m) {
  const src = isTwitch(m) ? `https://player.twitch.tv/?channel=${encodeURIComponent(m.slug)}&parent=${encodeURIComponent(location.hostname)}&muted=true&autoplay=true`
    : `https://player.kick.com/${encodeURIComponent(m.slug)}?muted=true&autoplay=true`;
  scr.innerHTML = `<iframe class="lv-player" src="${src}" title="${esc(m.name || m.slug)} live on ${platName(m)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
    <span class="lv-rec live"><i></i>LIVE${m.viewers != null ? ` · ${fmtNum(m.viewers)}` : ''}</span>
    <a class="lv-open" href="${homeUrl(m)}" target="_blank" rel="noopener">Open on ${platName(m)} ↗</a>`;
}
// the player runs 5 s behind live, and each transcript line shows when the picture reaches it
function playT() { const d = S.hls?.playingDate; const t0 = S.state?.t0; return d && t0 ? d.getTime() / 1000 - t0 : null; }
async function delayedPlayer(scr, m) {
  try {
    if (isTwitch(m)) throw new Error('no hls');                 // the room's relay is Kick's feed only
    const { url } = await get(`/hls/${encodeURIComponent(m.slug)}`);
    const { default: Hls } = await import(HLS_JS);
    if (!url || !Hls.isSupported()) throw new Error('no hls');
    scr.innerHTML = `<video class="lv-player lv-hls" muted autoplay playsinline></video>
      <span class="lv-rec live"><i></i>LIVE${m.viewers != null ? ` · ${fmtNum(m.viewers)}` : ''}</span>
      <a class="lv-open" href="${homeUrl(m)}" target="_blank" rel="noopener">Open on ${platName(m)} ↗</a>${CONTROLS}`;
    const v = scr.querySelector('video');
    const hls = new Hls({ liveSyncDuration: 5, liveMaxLatencyDuration: 15, maxLiveSyncPlaybackRate: 1.08, lowLatencyMode: false });
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { hls.destroy(); S.hls = null; streamIframe(scr, m); } });
    hls.loadSource(url); hls.attachMedia(v);
    S.hls = hls;
    v.play().catch(() => {});
  } catch { streamIframe(scr, m); }
}
setInterval(() => { if (S.hls && S.state) renderTx(); }, 400);

// ---------- render ----------
function renderWatch() {
  const s = S.state; if (!s) return;
  const m = s.meta || {};
  const live = s.status === 'live';
  $('#onair').className = `lv-onair ${live ? 'on' : 'off'}`;
  $('#air-word').textContent = live ? 'On air' : s.status === 'offline' ? 'Stream offline' : s.status === 'done' ? 'Session over' : 'Starting';
  $('#src-name').textContent = homeText(m);
  const scr = $('.lv-screen');
  if (scr && live && m.slug && scr.dataset.player !== m.slug) { scr.dataset.player = m.slug; delayedPlayer(scr, m); }
  else if (scr && live && m.viewers != null) { const b = scr.querySelector('.lv-rec.live'); if (b) b.innerHTML = `<i></i>LIVE · ${fmtNum(m.viewers)}`; }
  document.title = `${m.name || S.slug} · VICUT live room`;
  $('#watch').innerHTML = `
    <div class="lv-who"><span class="lv-plat${isTwitch(m) ? ' tw' : ''}">${isTwitch(m) ? 'TWITCH' : 'KICK'}</span><b>${esc(m.name || m.slug || '')}</b><span class="muted">${esc(clean(m.title || ''))}</span></div>
    <div class="lv-facts mono">
      ${m.category ? `<span>playing <b>${esc(m.category)}</b></span>` : ''}
      ${m.viewers != null ? `<span><b>${fmtNum(m.viewers)}</b> watching${live ? ' now' : ''}</span>` : ''}
      ${m.slug ? `<a href="${homeUrl(m)}" target="_blank" rel="noopener">${esc(homeText(m))} ↗</a>` : ''}
    </div>`;
}

function renderCounters() {
  const s = S.state; if (!s) return;
  const clips = [...S.clips.values()];
  const ready = clips.filter(isCut);
  const lat = ready.map((c) => c.after_moment_s).filter(Boolean);
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null;
  const items = [
    ['On air', hms(s.T)], ['Words heard', fmtNum(s.words ?? 0)], ['Chat read', fmtNum(s.chat_total ?? 0)],
    ['Moments', String((s.moments || []).length || clips.length)], ['Clips cut', String(ready.length)], ['Moment → clip', avg ? ms(avg) : '—'],
  ];
  $('#counters').innerHTML = items.map(([k, v]) => `<div><span class="k">${k}</span><b>${v}</b></div>`).join('');
  $('#feed-tc').textContent = `watching ${hms(s.T)}`;
  $('#air-clock').textContent = hms(s.T);
  $('#tx-meta').textContent = s.model ? 'speech to text, live' : '';
  $('#lag').textContent = s.chat_lag ? `chat lag ${(+s.chat_lag).toFixed(1)} s` : '';
}

const HYPE = /\b(no way|let'?s go+|oh my god|what the|holy|insane|crazy|wtf|bro+|yo+|stop|run|police|wanted|cops?|chase|crash)\b/gi;
function renderTx() {
  const pt = playT();
  const L = (pt == null ? S.lines : S.lines.filter((l) => l.start <= pt + 0.25)).slice(-9);
  $('#tx').innerHTML = L.length ? L.map((l, i) => `<li class="${i === L.length - 1 ? 'new' : ''}"><span class="mono">${hms(l.start)}</span><p>${esc(clean(l.text)).replace(HYPE, '<mark>$&</mark>')}</p></li>`).join('')
    : '<li class="muted"><p>Listening…</p></li>';
}

// the progress log: moments, the editor's calls, cuts. Never the posting side (accounts, schedules) or internal errors
function renderLog() {
  const L = S.log.filter((e) => ['clip', 'moment', 'status', 'update'].includes(e.k) && !INTERNAL.test(e.msg || '') && !/studio edit/i.test(e.msg || '')).slice(-40).reverse();
  $('#log').innerHTML = L.map((e) => `<li class="${e.k}"><span class="mono">${hms(e.T)}</span><p>${esc(clean(e.msg))}</p></li>`).join('');
  $('#log-n').textContent = `${L.length} updates`;
}

function stepper(c) {
  const at = ORDER[c.stage]; const t0 = c.times?.found;
  return `<ol class="lv-steps">${STAGES.map(([, label, tk], i) => {
    const done = at >= i; const cur = at === i && i < 3; const tt = c.times?.[tk];
    return `<li class="${done ? 'done' : ''} ${cur ? 'cur' : ''}"><i></i><span>${label}</span>${tt && i ? `<em class="mono">+${ms(tt - t0)}</em>` : ''}</li>`;
  }).join('')}</ol>`;
}
function chips(sig = {}) {
  const out = [];
  if (sig.semantic) out.push(`read: ${String(sig.semantic).replace(/_/g, ' ')}`);
  if (sig.chat_x >= 1.3) out.push(`chat ×${sig.chat_x}`);
  if (sig.laughs) out.push(`${sig.laughs} laughs`);
  if (sig.clip_it) out.push(`${sig.clip_it}× “clip it”`);
  if (sig.loud_z >= 1.5) out.push(`loud +${sig.loud_z}σ`);
  if (sig.score != null) out.push(sig.semantic ? `read ${sig.score}/10` : `score ${sig.score}`);
  return out.map((x) => `<span class="badge">${esc(x)}</span>`).join('');
}
// a finished cut's stable address (the room's own server stops when its hour ends; the gateway's /media stays)
const media = (c, ext) => `${API}/media/${encodeURIComponent(S.run)}/${encodeURIComponent(c.id)}.${ext}`;
function card(c) {
  const ready = isCut(c) && c.file; const out = dropped(c);
  const w = why(c);
  return `<article class="lv-card ${isCut(c) ? 'ready' : c.stage}" data-id="${esc(c.id)}">
    <header><span class="mono">${esc(c.id)}</span><span class="mono muted">moment at ${hms(c.peak)}</span><span class="badge ${out ? 'low' : ready ? 'ok' : 'mid'}">${esc(c.stage === 'queued' ? 'found' : isCut(c) ? 'ready' : out ? 'dropped' : c.stage)}</span></header>
    ${stepper(c)}
    ${c.hook && c.stage !== 'hidden' ? `<div class="lv-hook"><span>${esc(clean(c.hook))}</span></div>` : out ? '' : '<div class="lv-hook pending">the editor is reading it…</div>'}
    <div class="lv-chips">${chips(c.signals)}</div>
    ${out ? `<p class="lv-why">${c.stage === 'hidden' ? 'Held back by the safety check.' : w ? `Dropped: ${esc(w)}` : 'Dropped.'}</p>` : ''}
    ${ready ? `<div class="lv-vid"><video src="${media(c, 'mp4')}" poster="${media(c, 'jpg')}" controls playsinline preload="none"></video></div>` : ''}
    ${ready ? `<p class="lv-meta mono">${(c.duration || 0).toFixed(0)} s · ready <b>${ms(c.after_moment_s)}</b> after it happened · render ${Math.round(c.render_s || 0)} s</p>` : ''}
  </article>`;
}
const sig = (c) => `${c.stage}|${c.hook}|${c.why}`;
function renderCuts() {
  const list = [...S.clips.values()].sort((a, b) => b.peak - a.peak);
  $('#cut-n').textContent = `${list.filter(isCut).length} cut · ${list.length} found`;
  const box = $('#cuts');
  if (!list.length) return;
  // a card already on the page keeps its player (never restart a clip someone is watching)
  const have = new Map([...box.querySelectorAll('.lv-card')].map((el) => [el.dataset.id, el]));
  box.querySelector('.lv-empty')?.remove();
  let prev = null;
  for (const c of list) {
    let el = have.get(c.id);
    if (!el || el.dataset.sig !== sig(c)) {
      const t = document.createElement('div'); t.innerHTML = card(c);
      const fresh = t.firstElementChild; fresh.dataset.sig = sig(c);
      if (el) el.replaceWith(fresh); el = fresh;
    }
    if (prev ? prev.nextElementSibling !== el : box.firstElementChild !== el) prev ? prev.after(el) : box.prepend(el);
    prev = el;
  }
}

// ---------- the signal: loudness, chat speed and the moment score over the last five minutes ----------
const cv = $('#chart');
function drawChart() {
  const s = S.state; if (!s || !s.curve) return;
  const dpr = devicePixelRatio || 1; const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const end = Math.floor(s.T), start = end - 300;
  const X = (t) => ((t - start) / 300) * W;
  g.strokeStyle = 'rgba(255,240,230,.07)'; g.fillStyle = 'rgba(255,240,230,.35)'; g.font = '500 10px JetBrains Mono, monospace';
  for (let t = Math.ceil(start / 60) * 60; t <= end; t += 60) { g.beginPath(); g.moveTo(X(t), 0); g.lineTo(X(t), H); g.stroke(); if (t >= 0) g.fillText(hms(t).slice(3), X(t) + 4, H - 6); }
  const series = (arr, from, color, lo, hi, fill, width = 1.6) => {
    if (!arr?.length) return;
    g.beginPath();
    arr.forEach((v, i) => { const x = X(from + i), y = H - 18 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (H - 34); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
    if (fill) { g.lineTo(X(from + arr.length - 1), H - 18); g.lineTo(X(from), H - 18); g.closePath(); g.fillStyle = fill; g.fill(); }
  };
  const c = s.curve; const L = c.loud || [];
  const Ls = L.map((_, i) => (L[Math.max(0, i - 1)] + L[i] + L[Math.min(L.length - 1, i + 1)]) / 3);
  if (Ls.length) { const lo = Math.min(...Ls), hi = Math.max(...Ls); series(Ls, c.from, 'rgba(255,179,71,.55)', lo, hi, 'rgba(255,179,71,.06)', 1.2); }
  const C = c.chat || [];
  if (C.length) series(C, c.from, 'rgba(255,94,126,.95)', 0, Math.max(5, ...C), 'rgba(255,94,126,.12)', 1.4);
  const SC = c.score || [];
  if (SC.length) {
    const hi = Math.max(8, ...SC);
    series(SC, end - SC.length, '#23f0d6', 0, hi, null, 2);
    const ty = H - 18 - ((s.threshold || 4) / hi) * (H - 34);
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,240,230,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, ty); g.lineTo(W, ty); g.stroke(); g.setLineDash([]);
  }
  for (const m of s.moments || []) {
    if (m.peak < start) continue;
    const x = X(m.peak);
    g.fillStyle = 'rgba(214,58,249,.16)'; g.fillRect(X(m.src[0]), 0, X(m.src[1]) - X(m.src[0]), H - 18);
    g.strokeStyle = '#d63af9'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 4); g.lineTo(x, H - 18); g.stroke();
    g.fillStyle = '#d63af9'; g.fillRect(x, 4, 30, 15); g.fillStyle = '#fff'; g.font = '700 10px JetBrains Mono, monospace'; g.fillText(m.id, x + 4, 15);
  }
  g.fillStyle = '#ff4d6d'; g.fillRect(W - 2, 0, 2, H);
}
addEventListener('resize', drawChart);

// ---------- the editor's call on the latest moment, and the latest finished cut next to the stream it came from ----------
let showKey = '';
const mmss = ms;
function spanBar(c) {
  const w = c.window; const k = c.src;
  if (!w || !k || w[1] <= w[0]) return '';
  const L = w[1] - w[0]; const pct = (x) => `${Math.max(0, Math.min(100, ((x - w[0]) / L) * 100)).toFixed(1)}%`;
  return `<div class="lt-span" title="what the editor read, and the part it kept">
      <div class="lt-span-bar"><i style="left:${pct(k[0])};width:calc(${pct(k[1])} - ${pct(k[0])})"></i><b style="left:${pct(c.peak)}"></b></div>
      <span class="mono">read ${mmss(L)} of stream · kept ${mmss(k[1] - k[0])}${k[0] > w[0] + 0.5 ? `, from ${mmss(k[0] - w[0])} in` : ''} · ▲ the moment</span></div>`;
}
function editHTML(c) {
  const e = c.edit;
  if (!e || e.stage === 'failed') return '';
  if (e.stage !== 'ready') return '<p class="lt-edit-wait mono"><i></i>The editor is making a studio edit of this one: the tease, the slow motion, the drop on the punchline…</p>';
  return `<div class="lt-edit"><div class="lt-phone"><video src="${S.base}/${e.file}" poster="${S.base}/${e.poster}" muted autoplay loop playsinline></video>${muteBtn('sm')}</div>
    <div class="lt-edit-t"><span class="mono lt-edit-k">Studio edit · made by the room</span><b>${esc(clean(e.title || ''))}</b>
      <span class="mono">planned and rendered in ${mmss(e.took_s || 0)} · tease, slow motion, the drop on the punchline</span></div></div>`;
}
function humansLine(c) {
  const h = c.humans || []; if (!h.length) return '';
  const first = h[0]; const ours = c.after_moment_s;
  const lead = ours != null && first.after_s > ours ? `<b class="lt-first">VICUT was first by ${mmss(first.after_s - ours)}</b>` : '';
  return `<p class="lt-humans">${lead}<span>${h.length === 1 ? 'A viewer' : `${h.length} viewers`} clipped this moment too. Their raw 16:9 clip came ${mmss(first.after_s)} after it; this finished vertical cut came ${ours != null ? mmss(ours) : '—'} after it.</span></p>`;
}
function renderShow() {
  const cl = [...S.clips.values()];
  if (!cl.length) return;
  const at = (c) => Math.max(...Object.values(c.times || { x: 0 }));
  const last = cl.slice().sort((a, b) => at(b) - at(a))[0];
  const cut = cl.filter((c) => isCut(c) && c.file).sort((a, b) => (b.times?.ready || 0) - (a.times?.ready || 0))[0];
  const kept = cl.filter(isCut).length; const read = cl.filter((c) => c.stage !== 'queued' && c.stage !== 'judging').length;
  const key = JSON.stringify([last?.id, last?.stage, last?.hook, cut?.id, (cut?.humans || []).length, cut?.edit?.stage]);
  if (key === showKey) return;
  showKey = key; $('#show').hidden = !cut; $('#deskp').hidden = !last;
  const unq = (t) => String(t || '').replace(/^[“"]+|[”"]+$/g, '');
  const verdict = (c) => (c.stage === 'judging' ? '<b class="dk-wait">reading the moment…</b>'
    : dropped(c) ? `<b class="dk-drop">DROPPED</b> ${esc(why(c))}`
      : c.hook ? `<b class="dk-keep">KEPT</b> ${esc(why(c))}<span class="dk-hook">“${esc(clean(unq(c.hook)))}”</span>` : '');
  $('#desk-tc').textContent = last ? hms(last.peak) : '';
  $('#desk').innerHTML = last ? `${(last.seen || []).length ? `<div class="dk-frames">${last.seen.map((u) => `<img src="${S.base}/${u}" alt="" loading="lazy">`).join('')}</div>` : ''}
    <div class="lv-chips">${chips(last.signals)}</div>
    ${last.heard ? `<p class="dk-heard"><span class="mono">heard</span> “${esc(clean(last.heard.slice(0, 220)))}${last.heard.length > 220 ? '…' : ''}”</p>` : ''}
    <p class="dk-call">${verdict(last)}</p>
    <p class="dk-tally mono">kept ${kept} of ${read} moments it read</p>` : '';
  $('#latest-tc').textContent = cut ? cut.id : '';
  $('#latest').innerHTML = cut ? `<div class="lt-grid"><div class="lt-pair">
      ${(cut.seen || []).length ? `<figure class="lt-raw"><img src="${S.base}/${cut.seen[Math.min(2, cut.seen.length - 1)]}" alt=""><figcaption class="mono">the stream</figcaption></figure><span class="lt-arrow" aria-hidden="true">→</span>` : ''}
      <div class="lt-phone"><video src="${media(cut, 'mp4')}" poster="${media(cut, 'jpg')}" muted autoplay loop playsinline></video>${muteBtn('sm')}</div></div>
    <div class="lt-info"><p class="lt-meta"><b>${esc(clean(cut.hook || ''))}</b><span class="mono">ready ${cut.after_moment_s ? mmss(cut.after_moment_s) : '—'} after it happened · ${esc(cut.layout === 'hooksplit' ? 'facecam split' : 'auto-framed')} · nobody touched it</span></p>
    ${spanBar(cut)}${humansLine(cut)}${editHTML(cut)}</div></div>` : '';
}

// ---------- data: the room's events over a WebSocket, else polling its state ----------
function applyState(s) {
  if (s.run && s.run !== S.run) { S.clips.clear(); S.lines = []; showKey = ''; $('#cuts').innerHTML = ''; }   // a new hour-long session: its clip ids start over
  S.run = s.run || S.run; S.state = s;
  S.lines = s.lines || S.lines;
  S.log = (s.events || []).filter((e) => e.msg);
  for (const c of s.clips || []) S.clips.set(c.id, c);
  if (!S.clips.size) $('#cuts').innerHTML = '<p class="lv-empty">No moments yet. The room needs about two minutes of stream to learn what “normal” sounds like for this streamer.</p>';
  renderAll();
}
function renderAll() { renderWatch(); renderCounters(); renderTx(); renderLog(); renderCuts(); drawChart(); renderShow(); }
function onEvent(kind, ev) {
  if (ev.msg) { S.log.push(ev); renderLog(); }
  const s = S.state; if (!s) return;
  if (kind === 'tick') {
    if (ev.run && ev.run !== S.run) { reload(); return; }
    Object.assign(s, { T: ev.T, chat_total: ev.chat_total, meta: ev.meta, curve: ev.curve, status: ev.status, chat_lag: ev.chat_lag, model: ev.model });
    renderWatch(); renderCounters(); drawChart();
    if (Date.now() - lastThumb > 4000) refreshThumb();
  } else if (kind === 'tx') { S.lines.push({ start: ev.start, end: ev.end, text: ev.text }); s.words = (s.words || 0) + ev.text.split(/\s+/).length; renderTx(); }
  else if (kind === 'moment') { s.moments = [...(s.moments || []), ev.moment]; drawChart(); renderCounters(); }
  else if (kind === 'clip') { S.clips.set(ev.clip.id, ev.clip); renderCuts(); renderCounters(); renderShow(); }
  else if (kind === 'status' && ev.status) { s.status = ev.status; renderWatch(); }
}
let lastThumb = 0;
function refreshThumb() {
  lastThumb = Date.now();
  const img = $('#thumb'); if (!img || S.hls) return;
  const next = new Image();
  next.onload = () => {                   // (the live player may have taken the screen meanwhile)
    if (!img.isConnected) return;
    img.src = next.src; img.hidden = false; const e = $('#thumb-empty'); if (e) e.hidden = true;
  };
  next.src = `${S.base}/thumb.jpg?t=${lastThumb}`;
}
async function reload() { try { applyState(await get(`/${encodeURIComponent(S.slug)}/state`)); return true; } catch { return false; } }
function poll() {
  reload().then((ok) => { if (!ok) offline(); });
  setInterval(() => { if (!document.hidden) reload(); }, 3000);
}
function connectWS() {
  let opened = false, done = false, ws;
  try { ws = new WebSocket(`${S.base.replace(/^http/, 'ws')}/ws`); } catch { poll(); return; }
  const fallback = () => { if (opened || done) return; done = true; try { ws.close(); } catch { /* closed */ } poll(); };
  ws.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    let data; try { data = JSON.parse(msg.data); } catch { return; }
    if (msg.event === 'hello') { opened = true; applyState(data); refreshThumb(); } else if (opened) onEvent(msg.event, data);
  };
  ws.onerror = fallback;
  ws.onclose = () => { if (!opened) fallback(); else setTimeout(connectWS, 3000); };
  setTimeout(fallback, 4000);
}
function offline() {
  $('#onair').className = 'lv-onair off'; $('#air-word').textContent = 'Not on air';
  $('#watch').innerHTML = `<div class="lv-who"><b>${esc(S.slug)}</b><span class="muted">This room isn't on air right now. <a href="../explore/">See who is</a>.</span></div>`;
}

// ---------- the rooms on air: a tab for each ----------
function tabs(rooms) {
  const list = Object.entries(rooms || {}).sort(([, a], [, b]) => (b.viewers || 0) - (a.viewers || 0));
  $('#rooms').innerHTML = list.map(([slug, r]) => `<a href="${roomHref(slug, '../')}" ${slug === S.slug ? 'aria-current="page"' : ''}><i></i>${esc(r.name || slug)}</a>`).join('')
    + '<a class="lv-more" href="../explore/">Explore every GTA 6 stream →</a>';
  return list;
}

(async () => {
  let status = null;
  try { status = await get('/status'); } catch { /* the room's own state may still answer */ }
  const list = status ? tabs(status.rooms) : [];
  S.slug = (q.get('s') || q.get('room') || list[0]?.[0] || 'xqc').toLowerCase();
  if (status) tabs(status.rooms);
  S.base = `${API}/${encodeURIComponent(S.slug)}`;
  connectWS();
})();
