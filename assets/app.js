// VICUT home: the cut rooms on GTA 6 streams. Static first: with the rooms' API unreachable the page still reads right
// (the countdown, how it works, an honest empty wall); with it, the board, the rooms on air and the clip wall fill in.
import { API, DROP, GTA6, esc, fmtNum, clean, INTERNAL, get, roomHref } from './common.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hms = (s) => { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
const DAY = Math.floor(Date.UTC(2026, 10, 18) / 1000);   // the wall: every GTA 6 clip since release day began
let rooms = {};                                         // slug -> room on air (the gateway's /status)
let streamers = {};                                     // slug -> what they're streaming now (category, title)
let slug = q.get('room') || 'xqc';                      // the room on the board
let out = false;                                        // GTA 6 is out: the clock says so, or a room on air is playing it

// the drop: a countdown until it, "GTA 6 is out" once it is
function tickCount() {
  const left = (DROP - Date.now()) / 1000;
  if (left > 0 && !out) {
    $('count').hidden = false; $('count-t').textContent = hms(left);
    $('hero-chip').querySelector('span').textContent = `GTA 6 drops in ${hms(left)}`;
  } else {
    $('count').hidden = true; $('h-top').textContent = 'GTA 6 is out.';
    if (!$('hero-chip').classList.contains('live')) $('hero-chip').querySelector('span').textContent = 'GTA 6 · day one';
  }
}
tickCount(); setInterval(tickCount, 1000);

const seen = new Map();                                 // run/id -> clip, for the wall
const shown = new Map();                                // run/id -> its <figure> on the wall
// Keyed: a clip already on the wall is never re-rendered or moved (a visitor may be watching it); new ones are inserted
// in place, newest first.
function wall() {
  const box = $('wall');
  for (const [key, c] of seen) {
    if (shown.has(key)) continue;
    const f = document.createElement('figure');
    f.className = 'clip'; f.dataset.done = String(c.done || 0);
    f.innerHTML = `<div class="vid">
        <video src="${esc(c.src)}"${c.poster ? ` poster="${esc(c.poster)}"` : ''} controls playsinline preload="${c.poster ? 'none' : 'metadata'}"></video>
        ${c.after ? `<span class="ready">ready ${mmss(c.after)} after</span>` : ''}</div>
      <figcaption>${esc(clean(c.hook))}<span>${esc(c.who)}${c.dur ? ` · ${Math.round(c.dur)} s` : ''}</span></figcaption>`;
    box.insertBefore(f, [...box.children].find((n) => Number(n.dataset.done) < (c.done || 0)) || null);
    shown.set(key, f);
  }
  $('wall-empty').hidden = shown.size > 0;
}

// one room's state: the board (what it hears, the editor's calls) and its GTA 6 clips on the wall
function board(st) {
  const m = st.meta || {};
  const live = m.live !== false && st.status !== 'done';
  const on = $('onair'); on.classList.toggle('live', !!live);
  on.querySelector('span').textContent = live ? `Watching live · ${hms(st.T || 0)}` : 'Between sessions';
  $('who').textContent = m.name || slug;
  $('where').textContent = (m.credit || '').split('·').pop().trim() || `kick.com/${slug}`;
  $('viewers').textContent = m.viewers ? `${fmtNum(m.viewers)} watching` : '';
  $('title').textContent = clean([m.category, m.title].filter(Boolean).join(' · '));
  const lines = (st.lines || []).slice(-8);
  if (lines.length) $('hears').innerHTML = lines.map((l) => `<li><span>${hms(l.start)}</span>${esc(clean(l.text))}</li>`).join('');
  // (an internal failure, like "editor unavailable", isn't a call the editor made: it stays off the public board)
  const calls = (st.clips || []).filter((c) => (c.why || c.hook) && !INTERNAL.test(c.why || '')).slice(-6).reverse();
  if (calls.length) {
    $('calls').innerHTML = calls.map((c) => {
      const kept = ['ready', 'posting', 'posted', 'submitted', 'paid', 'cutting'].includes(c.stage);
      const why = clean(String(c.why || '').replace(/^dropped by the editor:\s*/i, ''));
      return `<li>${kept ? `<span class="k">KEPT${c.score ? ` · ${c.score}/10` : ''}</span><b>${esc(clean(c.hook || ''))}</b>`
        : `<span class="d">DROPPED</span><span class="why">${esc(why.slice(0, 140))}</span>`}</li>`;
    }).join('');
  }
  if (GTA6.test(m.category || '')) out = true;
  collect(st);
  $('board-link').href = roomHref(slug);
}
// a session's finished GTA 6 cuts, at the gateway's stable /media addresses (they outlive the room's hour)
function collect(st) {
  const m = st.meta || {};
  const gta = GTA6.test(m.category || '');
  for (const c of st.clips || []) {
    if (!['ready', 'posting', 'posted', 'submitted', 'paid'].includes(c.stage) || !c.file) continue;
    if (!(gta || GTA6.test(c.hook || ''))) continue;      // only GTA 6 moments: not the Just Chatting before it
    const key = `${st.run}/${c.id}`;
    if (!seen.has(key)) seen.set(key, { src: `${API}/media/${st.run}/${c.id}.mp4`, poster: `${API}/media/${st.run}/${c.id}.jpg`, hook: c.hook || '',
      who: m.name || st.meta?.slug || '', dur: c.duration, after: c.after_moment_s, done: (c.times || {}).ready || 0 });
  }
}

// every room on air: a chip for each, and their GTA 6 clips across sessions
function onairRow() {
  const list = Object.entries(rooms).sort(([, a], [, b]) => (b.viewers || 0) - (a.viewers || 0));
  $('onair-row').innerHTML = list.map(([s, r]) => `<a href="${roomHref(s)}"><i></i>${esc(r.name || s)}${r.viewers ? ` · ${fmtNum(r.viewers)}` : ''}</a>`).join('')
    + '<a class="more" href="explore/">Every GTA 6 stream →</a>';
}
async function allClips() {
  const slugs = new Set([slug, ...Object.keys(rooms)]);
  await Promise.all([...slugs].map(async (s) => {
    try {
      const j = await get(`/clips?slug=${encodeURIComponent(s)}&game=1&since=${DAY}`);
      // the list's own game filter is any GTA (GTA IV and V too): keep a clip when its streamer is in GTA 6 now or its hook says so
      const in6 = GTA6.test(streamers[s]?.category || '');
      for (const c of j.clips || []) {
        if (!in6 && !GTA6.test(c.hook || '')) continue;
        seen.set(`${c.run}/${c.id}`, { src: `${API}${c.media}`, poster: c.poster ? `${API}${c.poster}` : '', hook: c.hook || '', who: c.streamer || s,
          dur: c.duration, after: c.after_moment_s, done: c.done_at || 0 });
      }
    } catch { /* that room's list isn't offered */ }
  }));
}
async function status() {
  try {
    const st = await get('/status'); rooms = st.rooms || {}; streamers = st.streamers || {};
    if (!q.get('room') && !rooms[slug]) { const top = Object.entries(rooms).sort(([, a], [, b]) => (b.viewers || 0) - (a.viewers || 0))[0]; if (top) slug = top[0]; }
    onairRow();
  } catch { /* the board's own fetch reports it */ }
}

let fails = 0;
async function refresh() {
  if (document.hidden) return;
  try {
    const st = await get(`/${encodeURIComponent(slug)}/state`);
    board(st); fails = 0; $('board-off').hidden = true;
    const chip = $('hero-chip');
    if (out && st.meta?.live !== false) { chip.classList.add('live'); chip.querySelector('span').textContent = `Live now · cutting ${Object.keys(rooms).length > 1 ? `${Object.keys(rooms).length} streams` : st.meta?.name || slug}`; }
  } catch {
    if (++fails >= 2) { $('board-off').hidden = false; const on = $('onair'); on.classList.remove('live'); on.querySelector('span').textContent = 'Offline'; }
  }
  wall();
}
status().then(allClips).then(refresh);
setInterval(refresh, 5000);
setInterval(() => status().then(allClips).then(wall), 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
