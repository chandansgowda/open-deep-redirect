import siteConfig from "../../platforms.json" with { type: "json" };

export default async function (request, context) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/r\/([^/]+)\/(.+)$/);
  if (!match) return context.next();

  const platformKey = decodeURIComponent(match[1]);
  const id = match[2];
  const config = siteConfig.platforms[platformKey];
  if (!config) return context.next();

  const ID = decodeURIComponent(id);

  // ── Per-platform metadata providers ────────────────────────────────────────
  // Each entry can have:
  //   oembed(id)    → URL returning JSON with title / thumbnail_url / description
  //   thumbnail(id) → direct image URL (no fetch needed)
  //   description(id) → static description string when nothing else works
  const PROVIDERS = {
    // ── YouTube ──────────────────────────────────────────────────────────────
    "youtube": {
      thumbnail:   (i) => `https://img.youtube.com/vi/${i}/hqdefault.jpg`,
      oembed:      (i) => `https://www.youtube.com/oembed?url=${enc("https://www.youtube.com/watch?v=" + i)}&format=json`,
      description: (i) => `Watch this video on YouTube. Tap to open directly in the YouTube app.`,
    },
    "youtube-playlist": {
      oembed:      (i) => `https://www.youtube.com/oembed?url=${enc("https://www.youtube.com/playlist?list=" + i)}&format=json`,
      description: (i) => `A YouTube playlist. Tap to open directly in the YouTube app.`,
    },

    // ── Spotify ───────────────────────────────────────────────────────────────
    "spotify-track": {
      oembed:      (i) => `https://open.spotify.com/oembed?url=${enc("https://open.spotify.com/track/" + i)}`,
      description: (i) => `Listen to this track on Spotify. Tap to open in the Spotify app.`,
    },
    "spotify-album": {
      oembed:      (i) => `https://open.spotify.com/oembed?url=${enc("https://open.spotify.com/album/" + i)}`,
      description: (i) => `Listen to this album on Spotify. Tap to open in the Spotify app.`,
    },
    "spotify-playlist": {
      oembed:      (i) => `https://open.spotify.com/oembed?url=${enc("https://open.spotify.com/playlist/" + i)}`,
      description: (i) => `Listen to this playlist on Spotify. Tap to open in the Spotify app.`,
    },
    "spotify-artist": {
      oembed:      (i) => `https://open.spotify.com/oembed?url=${enc("https://open.spotify.com/artist/" + i)}`,
      description: (i) => `Listen to this artist on Spotify. Tap to open in the Spotify app.`,
    },
    "spotify-episode": {
      oembed:      (i) => `https://open.spotify.com/oembed?url=${enc("https://open.spotify.com/episode/" + i)}`,
      description: (i) => `Listen to this podcast episode on Spotify. Tap to open in the Spotify app.`,
    },
    "spotify-show": {
      oembed:      (i) => `https://open.spotify.com/oembed?url=${enc("https://open.spotify.com/show/" + i)}`,
      description: (i) => `Listen to this podcast on Spotify. Tap to open in the Spotify app.`,
    },

    // ── X / Twitter ───────────────────────────────────────────────────────────
    "x-status": {
      oembed:      (i) => `https://publish.twitter.com/oembed?url=${enc("https://twitter.com/i/status/" + i)}&omit_script=true`,
      description: (i) => `A post on X / Twitter. Tap to open directly in the X app.`,
    },
    "x-user": {
      thumbnail:   (i) => `https://unavatar.io/twitter/${i}`,
      description: (i) => `View @${i}'s profile on X / Twitter. Tap to open in the X app.`,
    },

    // ── Instagram ─────────────────────────────────────────────────────────────
    "instagram-post": {
      description: () => `An Instagram post. Tap to open directly in the Instagram app.`,
    },
    "instagram-profile": {
      description: () => `View this Instagram profile. Tap to open directly in the Instagram app.`,
    },

    // ── TikTok ────────────────────────────────────────────────────────────────
    "tiktok-video": {
      oembed:      (i) => `https://www.tiktok.com/oembed?url=${enc("https://www.tiktok.com/video/" + i)}`,
      description: (i) => `Watch this TikTok video. Tap to open directly in the TikTok app.`,
    },

    // ── Twitch ────────────────────────────────────────────────────────────────
    "twitch-channel": {
      thumbnail:   (i) => `https://static-cdn.jtvnw.net/previews-ttv/live_user_${i.toLowerCase()}-640x360.jpg`,
      description: (i) => `Watch ${i} live on Twitch. Tap to open in the Twitch app.`,
    },

    // ── Reddit ────────────────────────────────────────────────────────────────
    "reddit-post": {
      oembed:      (i) => `https://www.reddit.com/oembed?url=${enc("https://www.reddit.com/r/" + i + "/")}`,
      description: (i) => `A Reddit post. Tap to open directly in the Reddit app.`,
    },
    "reddit-subreddit": {
      thumbnail:   (i) => `https://www.redditstatic.com/icon.png`,
      description: (i) => `Browse r/${i} on Reddit. Tap to open in the Reddit app.`,
    },

    // ── LinkedIn ──────────────────────────────────────────────────────────────
    "linkedin-profile": {
      description: (i) => `View ${i}'s profile on LinkedIn. Tap to open in the LinkedIn app.`,
    },
    "linkedin-company": {
      description: (i) => `View ${i} on LinkedIn. Tap to open in the LinkedIn app.`,
    },

    // ── Pinterest ─────────────────────────────────────────────────────────────
    "pinterest-pin": {
      oembed:      (i) => `https://www.pinterest.com/oembed.json?url=${enc("https://www.pinterest.com/pin/" + i + "/")}`,
      description: (i) => `A Pinterest pin. Tap to open directly in the Pinterest app.`,
    },

    // ── Telegram ──────────────────────────────────────────────────────────────
    "telegram": {
      thumbnail:   (i) => `https://unavatar.io/telegram/${i}`,
      description: (i) => `Open @${i} on Telegram. Tap to open in the Telegram app.`,
    },

    // ── WhatsApp ──────────────────────────────────────────────────────────────
    "whatsapp": {
      description: (i) => `Start a WhatsApp chat with ${i}. Tap to open directly in WhatsApp.`,
    },

    // ── GitHub ────────────────────────────────────────────────────────────────
    "github-repo": {
      thumbnail:   (i) => `https://opengraph.githubassets.com/1/${i}`,
      description: (i) => `View the ${i} repository on GitHub. Tap to open in the GitHub app.`,
    },

    // ── Google Maps ───────────────────────────────────────────────────────────
    "maps-place": {
      thumbnail:   (i) => `https://maps.googleapis.com/maps/api/staticmap?center=${enc(i)}&zoom=14&size=600x300&maptype=roadmap`,
      description: (i) => `View ${decodeURIComponent(i)} on Google Maps. Tap to open in the Maps app.`,
    },

    // ── Apple Music ───────────────────────────────────────────────────────────
    "apple-music-song": {
      oembed:      (i) => `https://music.apple.com/oembed?url=${enc("https://music.apple.com/song/" + i)}`,
      description: (i) => `Listen to this song on Apple Music. Tap to open in the Music app.`,
    },
    "apple-music-album": {
      oembed:      (i) => `https://music.apple.com/oembed?url=${enc("https://music.apple.com/album/" + i)}`,
      description: (i) => `Listen to this album on Apple Music. Tap to open in the Music app.`,
    },
    "apple-music-playlist": {
      oembed:      (i) => `https://music.apple.com/oembed?url=${enc("https://music.apple.com/playlist/" + i)}`,
      description: (i) => `Listen to this playlist on Apple Music. Tap to open in the Music app.`,
    },
    "apple-music-artist": {
      oembed:      (i) => `https://music.apple.com/oembed?url=${enc("https://music.apple.com/artist/" + i)}`,
      description: (i) => `Listen to this artist on Apple Music. Tap to open in the Music app.`,
    },

    // ── Vimeo ─────────────────────────────────────────────────────────────────
    "vimeo-video": {
      oembed:      (i) => `https://vimeo.com/api/oembed.json?url=${enc("https://vimeo.com/" + i)}`,
      description: (i) => `Watch this video on Vimeo. Tap to open in the Vimeo app.`,
    },

    // ── Threads ───────────────────────────────────────────────────────────────
    "threads-post": {
      description: () => `A Threads post. Tap to open directly in the Threads app.`,
    },

    // ── Discord ───────────────────────────────────────────────────────────────
    "discord-invite": {
      thumbnail:   () => `https://assets-global.discord.com/assets/og-image.png`,
      description: (i) => `You've been invited to join a Discord server. Tap to open in the Discord app.`,
    },
  };

  const enc = encodeURIComponent;
  const provider = PROVIDERS[platformKey];

  let finalTitle       = config.name || platformKey;
  let finalImage       = null;
  let finalDescription = null;

  const buildWebUrl = (template, val) => {
    if (!template) return null;
    return template.replace(/\{id\}/g, val.split('/').map(encodeURIComponent).join('/'));
  };
  const webUrl = buildWebUrl(config.webLink, ID);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    // Strategy 1: oEmbed — best quality, platform-native
    if (provider?.oembed) {
      try {
        const res = await fetch(provider.oembed(ID), { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          finalTitle       = data.title || data.author_name || finalTitle;
          finalImage       = data.thumbnail_url || null;
          finalDescription = data.description   || null;
        }
      } catch (_) {}
    }

    // Strategy 2: Direct thumbnail — zero-fetch, always reliable
    if (!finalImage && provider?.thumbnail) {
      finalImage = provider.thumbnail(ID);
    }

    // Strategy 3: Native OG scrape — reads <head> of the target page
    if ((!finalImage || !finalDescription) && webUrl) {
      try {
        const res = await fetch(webUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "facebookexternalhit/1.1; WhatsApp/2.21.12.21 A" },
        });
        if (res.ok && res.body) {
          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let chunk = "";
          while (true) {
            const { done, value } = await reader.read();
            if (value) chunk += decoder.decode(value, { stream: true });
            if (done || chunk.includes('</head>') || chunk.length > 50000) {
              try { reader.cancel(); } catch (_) {}
              break;
            }
          }
          const pick = (html, ...patterns) => {
            for (const p of patterns) {
              const m = html.match(p);
              if (m?.[1]) return m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
            }
            return null;
          };
          if (!finalDescription) {
            finalDescription = pick(chunk,
              /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i,
              /<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i,
              /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
              /<meta[^>]+content="([^"]+)"[^>]+name="description"/i,
            );
          }
          if (!finalImage) {
            let src = pick(chunk,
              /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
              /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i,
            );
            if (src) {
              src = src.replace(/&amp;/g, '&');
              if (src.startsWith('//')) src = 'https:' + src;
              else if (src.startsWith('/')) src = new URL(webUrl).origin + src;
              finalImage = src;
            }
          }
          if (finalTitle === config.name) {
            finalTitle = pick(chunk,
              /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
              /<title>([^<]+)<\/title>/i,
            ) || finalTitle;
          }
        }
      } catch (_) {}
    }

    // Strategy 4: Microlink — last resort for image + description
    if ((!finalImage || !finalDescription) && webUrl) {
      try {
        const res = await fetch(`https://api.microlink.io/?url=${enc(webUrl)}`, { signal: controller.signal });
        if (res.ok) {
          const { status, data } = await res.json();
          if (status === "success" && data) {
            if (finalTitle === config.name && data.title)       finalTitle       = data.title;
            if (!finalImage       && data.image?.url)           finalImage       = data.image.url;
            if (!finalDescription && data.description)          finalDescription = data.description;
          }
        }
      } catch (_) {}
    }

    clearTimeout(timeout);
  } catch (err) {
    console.error(`[og-injector] ${platformKey}:`, err.message);
  }

  // Strategy 5: Per-platform static description — better than a generic fallback
  if (!finalDescription && provider?.description) {
    finalDescription = provider.description(ID);
  }

  // Strategy 6: Absolute last-resort generic fallback
  if (!finalDescription) {
    const kind = (config.kind || "content").toLowerCase();
    finalDescription = `Open this ${kind} on ${config.name}. Tap to open directly in the native app, with a web fallback.`;
  }

  // ── Fetch static HTML shell ─────────────────────────────────────────────────
  const response = await context.next();
  let html = await response.text();

  // ── Inject metadata ─────────────────────────────────────────────────────────
  // Finds a <meta> tag by its property/name selector and swaps only content="..."
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escHtml     = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  const replaceMeta = (h, selector, newContent) =>
    h.replace(
      new RegExp(`<meta[^>]+${escapeRegex(selector)}[^>]*>`, 'i'),
      (tag) => tag.replace(/content="[^"]*"/, `content="${newContent}"`),
    );

  const safeTitle = escHtml(finalTitle);
  const safeDesc  = escHtml(finalDescription.replace(/[\r\n]+/g, ' '));
  const safeImage = finalImage ? escHtml(finalImage) : null;

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle} | Open Deep Redirect</title>`);

  html = replaceMeta(html, 'property="og:title"',       safeTitle);
  html = replaceMeta(html, 'property="og:description"', safeDesc);
  html = replaceMeta(html, 'property="og:url"',         escHtml(request.url));
  html = replaceMeta(html, 'property="og:type"',        'article');
  html = replaceMeta(html, 'name="twitter:title"',       safeTitle);
  html = replaceMeta(html, 'name="twitter:description"', safeDesc);
  html = replaceMeta(html, 'name="description"',         safeDesc);

  if (safeImage) {
    html = replaceMeta(html, 'property="og:image"',      safeImage);
    html = replaceMeta(html, 'name="twitter:image"',     safeImage);
    html = replaceMeta(html, 'property="og:image:alt"',  safeTitle);
    html = replaceMeta(html, 'name="twitter:image:alt"', safeTitle);
    html = html.replace(/<meta\s+property="og:image:width"[^>]*>\n?/ig,  '');
    html = html.replace(/<meta\s+property="og:image:height"[^>]*>\n?/ig, '');
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set("content-type", "text/html;charset=utf-8");
  return new Response(html, { status: response.status, headers: newHeaders });
}

export const config = { path: "/r/*" };
