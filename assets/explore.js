// Explore: every GTA 6 stream live right now, from the room gateway's /status (the streamers it follows, live or not, and
// the rooms on air). "Cutting now" is only a room that is on air; everyone else is live but not in a cut room yet.
import { API, GTA6, RISKY, esc, fmtNum, clean, get, roomHref } from './common.js';

const $ = (s) => document.querySelector(s);
const today = Math.floor(Date.UTC(2026, 10, 18) / 1000);
const plat = (v) => (v.platform === 'twitch' ? 'twitch' : 'kick');
const streamUrl = (slug, v) => (plat(v) === 'twitch' ? `https://www.twitch.tv/${encodeURIComponent(v.handle || slug)}` : `https://kick.com/${encodeURIComponent(v.handle || slug)}`);
const clipsN = {};   // slug -> GTA 6 clips the room cut today

function thumb(slug, v, onAir, t) {
  if (onAir) return `${API}/${encodeURIComponent(slug)}/thumb.jpg?t=${t}`;
  if (plat(v) === 'twitch' && v.thumb) return `${v.thumb}?t=${Math.round(t / 300)}`;
  return `${API}/kthumb/${encodeURIComponent(slug)}?t=${Math.round(t / 120)}`;
}
function card(slug, v, kind, t) {
  const on = kind === 'on';
  const href = on ? roomHref(slug, '../') : streamUrl(slug, v);
  const n = clipsN[slug];
  return `<a class="xc ${kind}" href="${href}"${on ? '' : ' target="_blank" rel="noopener"'}>
    <div class="xc-img"><img src="${esc(thumb(slug, v, on, t))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="xc-live"><i></i>LIVE · ${fmtNum(v.viewers)}</span><span class="xc-plat ${plat(v)}">${plat(v) === 'twitch' ? 'TWITCH' : 'KICK'}</span></div>
    <div class="xc-t">
      ${v.avatar ? `<img class="xc-av" src="${esc(v.avatar)}" alt="" loading="lazy">` : '<span class="xc-av"></span>'}
      <div><b>${esc(v.name || slug)}</b><span>${esc(clean(v.title || ''))}</span>
        <em class="${on ? 'on' : ''}">${on ? `Cutting now${n ? ` · ${n} GTA 6 clip${n > 1 ? 's' : ''} today` : ''} · open the room →` : kind === 'gta' ? 'Playing GTA 6 · not in a cut room yet' : 'About to play GTA 6 · not in a cut room yet'}</em></div>
    </div></a>`;
}

async function render() {
  let st;
  try { st = await get('/status'); } catch { $('#x-off').hidden = false; return; }
  $('#x-off').hidden = true;
  const S = st.streamers || {}; const rooms = st.rooms || {}; const t = Math.round(st.at || Date.now() / 1000);
  const live = Object.entries(S).filter(([k, v]) => v.live && !RISKY.has(k));
  // a room on air for a streamer the gateway doesn't follow still shows (its own state has the details)
  for (const [slug, r] of Object.entries(rooms)) if (!S[slug]) live.push([slug, { name: r.name, viewers: r.viewers, live: true, platform: 'kick', category: '', title: '' }]);
  const by = (a, b) => (b[1].viewers || 0) - (a[1].viewers || 0);
  const on = live.filter(([k]) => rooms[k]).sort(by);
  const gta = live.filter(([k, v]) => !rooms[k] && GTA6.test(v.category || '')).sort(by);
  const soon = live.filter(([k, v]) => !rooms[k] && !GTA6.test(v.category || '') && GTA6.test(v.title || '')).sort(by);
  await Promise.all(on.map(async ([slug]) => {
    try { clipsN[slug] = ((await get(`/clips?slug=${encodeURIComponent(slug)}&game=1&since=${today}`)).clips || []).length; } catch { /* the count waits */ }
  }));
  const playing = [...on, ...gta].filter(([, v]) => GTA6.test(v.category || '')).length;
  const watching = [...on, ...gta, ...soon].reduce((a, [, v]) => a + (v.viewers || 0), 0);
  $('#x-stats').innerHTML = [[on.length, on.length === 1 ? 'room cutting' : 'rooms cutting'], [playing, 'playing GTA 6 now'], [soon.length, 'about to start'], [fmtNum(watching), 'watching these streams']]
    .map(([n, k]) => `<div><dt>${k}</dt><dd class="mono">${n}</dd></div>`).join('');
  $('#x-on').innerHTML = on.length ? on.map(([k, v]) => card(k, { ...v, viewers: rooms[k].viewers || v.viewers }, 'on', t)).join('') : '<p class="x-empty">No room is on air this minute. The next one starts as soon as a streamer it follows goes live.</p>';
  $('#x-gta').innerHTML = gta.length ? gta.map(([k, v]) => card(k, v, 'gta', t)).join('') : '<p class="x-empty">Nobody else the rooms follow is in GTA 6 right now.</p>';
  $('#x-soon').innerHTML = soon.map(([k, v]) => card(k, v, 'soon', t)).join('');
  $('#x-soon-sec').hidden = !soon.length;
}
render();
setInterval(() => { if (!document.hidden) render(); }, 30000);
