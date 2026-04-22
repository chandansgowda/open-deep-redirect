# Open Deep Redirect

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)
[![No Build](https://img.shields.io/badge/build-none-lightgrey.svg)](#)
[![Deploy to Netlify](https://img.shields.io/badge/deploy-Netlify-00C7B7.svg)](#deploying-to-netlify)

A **zero-backend, one-page site** that turns any supported URL into a clean redirect link. When a friend opens that link on their phone, it tries the **native app** first, then falls back to the **web** — no tracking, no analytics, no server.

```
https://your-domain.com/r/{platform}/{id}
```

- **Pure static** — just HTML + CSS + vanilla JS. No build step, no server, no dependencies.
- **Config-driven** — add or edit platforms by touching `platforms.json`. No code changes needed.
- **Private & safe** — runs entirely in the browser. Only domains on the allow-list are accepted; IDs are validated against per-platform regex before any redirect.
- **Open source** — MIT-licensed. Fork it, self-host it, add your own platforms.

## How it works

### Generator (`/`)

1. Paste a URL (YouTube, Spotify, X, Instagram, Reddit, TikTok, Twitch, LinkedIn, Telegram, WhatsApp, Pinterest, …).
2. The page matches the domain against `platforms.json`, runs the platform's regex extractors, and pulls out an `id`.
3. You get a shareable link:

   ```
   https://your-domain.com/r/{platform}/{id}
   ```

### Redirect (`/r/{platform}/{id}`)

1. Shows a loading UI with the detected platform.
2. Navigates to `deepLink` (e.g. `youtube://watch?v=ID`) to hand off to the native app.
3. If the page is still foregrounded after a short delay, it navigates to `webLink` as a fallback.
4. Manual **Open in app** / **Open in browser** buttons are always available.

## Deploying to Netlify

This project is configured for Netlify out of the box. No build step, no backend.

### Option A — Netlify CLI

```bash
npm i -g netlify-cli
netlify deploy            # preview deploy
netlify deploy --prod     # production deploy
```

### Option B — Git-based deploy

1. Push this folder to a GitHub / GitLab / Bitbucket repo.
2. In Netlify: **Add new site → Import an existing project** and pick the repo.
3. Leave **Build command** empty and **Publish directory** set to `.` (already declared in `netlify.toml`).
4. Deploy.

### Option C — Drag & drop

Just drag the project folder onto <https://app.netlify.com/drop>.

### What's wired up for you

- **`netlify.toml`** — publish dir, `/r/*` → `/index.html` rewrite (status 200, so the URL stays clean), and sensible security + cache headers.
- **`_redirects`** — same rewrite rule as a fallback, for any tooling that reads it.
- `platforms.json` and `index.html` are served with `Cache-Control: no-cache`, so edits go live on the next page load. All other static assets get Netlify's default CDN caching.

### Local preview

Any static server works. For example:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then open <http://localhost:8080>.

> Opening `index.html` directly via `file://` also works — browsers block `fetch('./platforms.json')` under `file://` due to CORS, so the app transparently falls back to an inline copy of the config embedded in `index.html`. That inline copy is kept in sync by a tiny script (see "Editing the config" below).

## Editing the config

`platforms.json` is the source of truth. On Netlify (or any same-origin static host) the browser fetches it directly, so your edits go live on the next page load — no rebuild.

There's also an inline copy of the same config embedded inside `index.html` that's only used when `fetch('./platforms.json')` fails (most commonly when opening the file via `file://` locally, which browsers block as CORS). Keep the inline copy in sync with this one-liner whenever you change `platforms.json`:

```bash
node scripts/sync-inline-config.mjs
```

The script reads `platforms.json`, validates it, minifies it, and injects it between the `INLINE_CONFIG_START` / `INLINE_CONFIG_END` markers in `index.html`. If you only ever deploy to a real host and don't use `file://`, you can skip this step entirely.

## Adding a platform

Open `platforms.json` and add a new entry under `"platforms"`:

```json
"my-platform": {
  "name": "My Platform",
  "kind": "Post",
  "icon": "★",
  "color": "#ff0080",
  "domains": ["myplatform.com", "www.myplatform.com"],
  "extractors": [
    "myplatform\\.com/post/([A-Za-z0-9]+)"
  ],
  "idValidator": "^[A-Za-z0-9]+$",
  "deepLink": "myplatform://post/{id}",
  "webLink": "https://www.myplatform.com/post/{id}"
}
```

Field reference:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Display name. |
| `kind` | no | Content type shown next to the name (e.g. "Track", "Post"). |
| `icon` | no | Emoji/short glyph displayed in the platform tile. |
| `color` | no | Hex color used for the swatch + tile icon background. |
| `domains` | yes | List of hostnames the URL must match (exact or subdomain). Nothing else is ever accepted — this is the core security check. |
| `extractors` | yes | Regex patterns tested in order against the full URL. The **first capture group** becomes the `id`. |
| `idValidator` | no | Optional regex the extracted id must fully match. Also enforced on `/r/...` redirects. |
| `deepLink` | yes | Template for the app/custom-scheme URL. `{id}` is substituted. |
| `webLink` | yes | Template for the browser fallback URL. `{id}` is substituted. |

### Tips

- **Multiple content types on the same service** — add separate entries like `spotify-track`, `spotify-album`, `spotify-playlist`. Each has its own extractors and link templates. That's how Spotify is configured in the default `platforms.json`.
- **Order matters** within a platform's `extractors` array and across platforms: the first match wins. Put the most specific patterns first.
- **IDs can contain slashes** (Reddit posts use `sub/comments/xyz`). The app preserves path structure when building and parsing `/r/{platform}/{id...}`.

## Security & privacy

- URLs are matched against an **allow-list of domains**; anything else is rejected with a clear error.
- The extracted id is validated against `idValidator` both when generating and when redirecting. Manipulated `/r/...` URLs with malformed ids won't redirect.
- Templates only substitute a single `{id}` token — there's no arbitrary URL construction.
- **No server, no logging, no analytics.** The app runs entirely in the user's browser. Links you generate and redirects you follow never leave the client.

## Project layout

```
open-deep-redirect/
├── index.html        # the entire app (plus an inline fallback copy of the config)
├── platforms.json    # the only file you need to edit to add platforms
├── netlify.toml      # Netlify config (publish dir, rewrites, headers)
├── _redirects        # Netlify rewrite fallback
├── scripts/
│   └── sync-inline-config.mjs   # embeds platforms.json into index.html
├── LICENSE
└── README.md
```

## Contributing

Contributions are very welcome! The easiest and most valuable contribution is **adding a new platform** — it's usually just a few lines of JSON.

### Quick start for contributors

1. Fork the repo and clone your fork.
2. Make your change (see [Adding a platform](#adding-a-platform) or [Editing the config](#editing-the-config)).
3. If you edited `platforms.json`, keep the inline copy in sync:
   ```bash
   node scripts/sync-inline-config.mjs
   ```
4. Test locally with `python3 -m http.server 8080` (or any static server) and verify:
   - Your URL is parsed correctly on the home page.
   - The generated `/r/{platform}/{id}` link opens the native app on a phone and falls back to the web.
5. Open a pull request describing **what platform/content kind you added** and include a sample URL.

### Good first issues

- Adding more content kinds for existing platforms (e.g. YouTube Shorts, Spotify shows).
- Supporting new platforms (SoundCloud, Snapchat, Bluesky, Mastodon, etc.).
- Improving the UI / accessibility.
- Writing tests for the extractor regexes.

### Ground rules

- Keep the **zero-backend, zero-build** promise. Any dependency that needs a build step is out of scope.
- Keep the **allow-list + regex validation** model. Don't add paths that accept arbitrary URLs.
- Don't add tracking, analytics, or third-party scripts that make network calls.
- Match the existing code style — the project uses plain HTML/CSS/JS on purpose.

### Reporting bugs / requesting platforms

Open a [GitHub issue](../../issues) with:

- **Bug**: the URL you pasted, what you expected, what happened, and your browser/OS.
- **New platform request**: a handful of sample URLs for the content kind, plus the app's custom-scheme deep link if you know it.

## Acknowledgements

- The services this project links to — logos, trademarks, and content remain the property of their respective owners. Open Deep Redirect only constructs URLs using public URL schemes; it does not proxy, cache, or serve any content from these services.
- Inspired by the long-standing frustration of sharing a Spotify / YouTube / Instagram link and having it open in the wrong place on someone else's phone.

## License

Released under the [MIT License](./LICENSE). You are free to use, modify, self-host, and redistribute this project — just keep the copyright notice.

---

If you find this useful, consider ⭐ starring the repo — it helps other people discover it.
