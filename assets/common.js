// Shared by VICUT's pages: where the live rooms answer, and the small helpers every page uses.
const q = new URLSearchParams(location.search);
export const API = (q.get('api') || 'https://api.hookrs.fun/cutroom/live').replace(/\/$/, '');
export const DROP = Date.UTC(2026, 10, 18, 11, 0, 0);          // GTA 6: 6 AM ET, 18 Nov 2026
// GTA 6 itself: "Grand Theft Auto VI" (Twitch and Kick's category), "GTA 6", "GTA VI". Not GTA V, not an IRL "GTA day".
export const GTA6 = /grand theft auto (vi|6)\b|\bgta ?(vi|6)\b/i;
// streamers cutroom's brand-risk list never features (the same list, so VICUT never lists them either)
export const RISKY = new Set(['.tjr.him', '_tjrtrades', 'akademiks', 'iceposeidon', 'jackdoherty', 'livesneako', 'mizkif', 'realmizkif', 'sneako', 'trainwreckstv']);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function fmtNum(n) {
  if (n == null || Number.isNaN(+n)) return '—';
  n = +n;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}
// the page is public: anything a stream said is masked the same way the clips' captions are
const BLEEP = [[/f+u+c+k/gi, 'f**k'], [/sh+i+t/gi, 'sh*t'], [/b+i+t+c+h/gi, 'b*tch'], [/d+i+c+k/gi, 'd*ck'], [/p+u+s+s+y/gi, 'p***y'], [/c+u+n+t/gi, 'c**t'], [/n+i+g+g\w*/gi, 'n***'], [/\bf+a+g+\w*/gi, 'f**'], [/r+e+t+a+r+d\w*/gi, 'r****d']];
export const clean = (t) => BLEEP.reduce((x, [re, r]) => x.replace(re, r), String(t ?? ''));
// what the engine says about its own plumbing (posting accounts, models, errors) stays off VICUT's pages
export const INTERNAL = /cutroom|buffer|tiktok|instagram|youtube|posting|posted|warming up|program|bounty|payout|\$\d|codex|claude|openai|unavailable|error|traceback|failed|operator|@\w/i;
export const get = (path) => fetch(`${API}${path}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
export const roomHref = (slug, up = '') => `${up}room/?s=${encodeURIComponent(slug)}`;
