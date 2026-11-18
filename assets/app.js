// VICUT: the live cut room on a GTA 6 stream. Static first: with the room's API unreachable the page still reads right
// (the countdown, how it works, an honest empty wall); with it, the board and the clip wall fill in and refresh.
(() => {
  const q = new URLSearchParams(location.search);
  const API = (q.get('api') || 'https://api.hookrs.fun/cutroom/live').replace(/\/$/, '');
  const SLUG = q.get('room') || 'xqc';
  const DROP = Date.UTC(2026, 10, 18, 11, 0, 0);          // GTA 6 on xQc's stream: 6 AM ET, 18 Nov 2026
  const GTA = /grand theft auto|\bgta\b|gta ?6|gta ?vi/i;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const hms = (s) => { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n || 0));
  const get = (path) => fetch(`${API}${path}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

  // the drop: a countdown until it, "day one" after
  function tickCount() {
    const left = (DROP - Date.now()) / 1000;
    if (left > 0) {
      $('count').hidden = false; $('count-t').textContent = hms(left);
      $('hero-chip').querySelector('span').textContent = `GTA 6 drops in ${hms(left)}`;
    } else {
      $('count').hidden = true; $('h-top').textContent = 'GTA 6 is out.';
      if (!$('hero-chip').classList.contains('live')) $('hero-chip').querySelector('span').textContent = 'GTA 6 · day one';
    }
  }
  tickCount(); setInterval(tickCount, 1000);

  const seen = new Map();                                 // run/id -> clip, for the wall
  function wall() {
    const list = [...seen.values()].sort((a, b) => (b.done || 0) - (a.done || 0));
    $('wall').innerHTML = list.map((c) => `<figure class="clip"><div class="vid">
        <video src="${esc(c.src)}"${c.poster ? ` poster="${esc(c.poster)}"` : ''} controls playsinline preload="${c.poster ? 'none' : 'metadata'}"></video>
        ${c.after ? `<span class="ready">ready ${mmss(c.after)} after</span>` : ''}</div>
      <figcaption>${esc(c.hook)}<span>${esc(c.who)}${c.dur ? ` · ${Math.round(c.dur)} s` : ''}</span></figcaption></figure>`).join('');
    $('wall-empty').hidden = list.length > 0;
  }

  // one room's state: the board (what it hears, the editor's calls) and its GTA 6 clips on the wall
  function board(st) {
    const m = st.meta || {};
    const live = m.live !== false && st.status !== 'done';
    const on = $('onair'); on.classList.toggle('live', !!live);
    on.querySelector('span').textContent = live ? `Watching live · ${hms(st.T || 0)}` : 'Between sessions';
    $('who').textContent = m.name || SLUG;
    $('where').textContent = (m.credit || '').split('·').pop().trim() || `kick.com/${SLUG}`;
    $('viewers').textContent = m.viewers ? `${k(m.viewers)} watching` : '';
    $('title').textContent = [m.category, m.title].filter(Boolean).join(' · ');
    const lines = (st.lines || []).slice(-8);
    if (lines.length) $('hears').innerHTML = lines.map((l) => `<li><span>${hms(l.start)}</span>${esc(l.text)}</li>`).join('');
    // (an internal failure, like "editor unavailable", isn't a call the editor made: it stays off the public board)
    const calls = (st.clips || []).filter((c) => (c.why || c.hook) && !/unavailable|codex|error|traceback|failed/i.test(c.why || '')).slice(-6).reverse();
    if (calls.length) {
      $('calls').innerHTML = calls.map((c) => {
        const kept = ['ready', 'posting', 'posted', 'submitted', 'paid', 'cutting'].includes(c.stage);
        const why = String(c.why || '').replace(/^dropped by the editor:\s*/i, '');
        return `<li>${kept ? `<span class="k">KEPT${c.score ? ` · ${c.score}/10` : ''}</span><b>${esc(c.hook || '')}</b>`
          : `<span class="d">DROPPED</span><span class="why">${esc(why.slice(0, 140))}</span>`}</li>`;
      }).join('');
    }
    // GTA 6 moments only: the stream's category says so (its title has said "GTA 6" since before the drop, over Just Chatting)
    const gta = GTA.test(m.category || '') && Date.now() >= DROP;
    for (const c of st.clips || []) {
      if (!['ready', 'posting', 'posted', 'submitted', 'paid'].includes(c.stage) || !c.file) continue;
      if (!(gta || GTA.test(c.hook || ''))) continue;
      const key = `${st.run}/${c.id}`;
      // the gateway's /media addresses outlive the room's hour-long session (its own server stops when the hour ends)
      if (!seen.has(key)) seen.set(key, { src: `${API}/media/${st.run}/${c.id}.mp4`, poster: `${API}/media/${st.run}/${c.id}.jpg`, hook: c.hook || '',
        who: m.name || SLUG, dur: c.duration, after: c.after_moment_s, done: (c.times || {}).ready || 0 });
    }
  }

  // every GTA 6 clip across the room's sessions, when the API offers the list (it may not: the wall then shows this session's)
  async function allClips() {
    try {
      const j = await get(`/clips?slug=${encodeURIComponent(SLUG)}&game=1&since=${Math.floor(DROP / 1000)}`);
      for (const c of j.clips || j || []) {
        const key = `${c.run}/${c.id}`;
        seen.set(key, { src: `${API}${c.media}`, poster: c.poster ? `${API}${c.poster}` : '', hook: c.hook || '', who: c.streamer || 'xQc',
          dur: c.duration, after: c.after_moment_s, done: c.done_at || 0 });
      }
    } catch { /* not offered (yet) */ }
  }

  let fails = 0;
  async function refresh() {
    if (document.hidden) return;
    try {
      const st = await get(`/${SLUG}/state`);
      board(st); fails = 0; $('board-off').hidden = true;
      const chip = $('hero-chip');
      if (Date.now() >= DROP && st.meta?.live !== false) { chip.classList.add('live'); chip.querySelector('span').textContent = `Live now · cutting ${st.meta?.name || SLUG}`; }
    } catch {
      if (++fails >= 2) { $('board-off').hidden = false; const on = $('onair'); on.classList.remove('live'); on.querySelector('span').textContent = 'Offline'; }
    }
    wall();
  }
  allClips().then(refresh);
  setInterval(refresh, 5000);
  setInterval(() => allClips().then(wall), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
