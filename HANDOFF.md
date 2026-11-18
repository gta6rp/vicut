# VICUT: what's done, and the steps left for the user

## Done

- **Site:** a one-page static site in this folder (`index.html`, `assets/`). No build step, relative paths.
  Hosted on GitHub Pages from **github.com/gta6rp/vicut** at **https://gta6rp.github.io/vicut/**.
- **Live data:** the page reads the xQc GTA 6 cut room on the Spark (`https://api.hookrs.fun/cutroom/live`):
  - `/xqc/state` (the board: what the room hears, the editor's calls, this session's clips);
  - `/clips?slug=xqc&game=1&since=…` (every GTA 6 clip across the room's hour-long sessions, newest first);
  - `/media/<run>/<clip>.mp4` and `.jpg` (each clip's video and poster, at addresses that last).
  The gateway (`clips/pipeline/live/gateway.py`) allows this site's origins in its CORS list.
  With the API unreachable, the page still works: the countdown, how it works, an honest empty wall, and a "not reachable"
  note on the board.
- **Brand:** `BRAND.md` (name, tagline, palette, type, voice, trademark rules), the mark, the X avatar, the banner, the
  share card, the bio and the first-post drafts.

## Two steps only the user can do

1. **Buy vicut.fun** (Namecheap, Cloudflare, or any registrar; .fun is usually a few dollars for the first year). Then
   point it at GitHub Pages:
   - DNS:
     - apex `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     - `www` `CNAME` → `gta6rp.github.io`
   - Then add the custom domain: either repo **Settings → Pages → Custom domain** = `vicut.fun` (and tick **Enforce HTTPS**
     once the certificate is ready), or commit a file named `CNAME` containing `vicut.fun`.
     Don't add the `CNAME` file before the DNS works: Pages would redirect gta6rp.github.io/vicut to a domain that doesn't
     resolve yet.
   - Then change the two share-card URLs in `index.html` (`og:image`, `twitter:image`) to
     `https://vicut.fun/assets/og.png`.
2. **Create the X account @vicutfun.** Upload `brand/x-avatar.png` and `brand/x-banner.png`, and paste the bio from
   `BRAND.md`. Optionally take @vicutfun on TikTok, Instagram and YouTube too.

## One link to cutroom that remains

The page's data comes from `api.hookrs.fun/cutroom/live`, which visitors can see in the browser's network tab. To hide
it, serve the API from `api.vicut.fun` through the same Cloudflare tunnel once the domain is on Cloudflare, and open the
page with `?api=https://api.vicut.fun/cutroom/live` (or change `API` in `assets/app.js`). The gateway's CORS list already
includes `https://gta6rp.github.io`, `https://vicut.fun` and `https://www.vicut.fun`.

## Updating the site

Edit the files and push to `main` on gta6rp/vicut; Pages redeploys in about a minute. To add a streamer, change `SLUG`
(or use `?room=<slug>`) once that streamer has a cut room running.
