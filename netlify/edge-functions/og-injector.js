import siteConfig from "../../platforms.json" with { type: "json" };

export default async function (request, context) {
  // 1. Parse /r/{platform}/{id}
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/r\/([^/]+)\/(.+)$/);
  if (!match) return context.next();

  const platformKey = decodeURIComponent(match[1]);
  const id = match[2];

  const config = siteConfig.platforms[platformKey];
  if (!config) return context.next();

  const ID_DECODED = decodeURIComponent(id);

  // oEmbed + direct thumbnail providers
  const PREVIEW_PROVIDERS = {
    "youtube": {
      thumbnail: (i) => `https://img.youtube.com/vi/${i}/hqdefault.jpg`,
      oembed: (i) => `https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + i)}&format=json`,
    },
    "youtube-playlist": {
      oembed: (i) => `https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/playlist?list=" + i)}&format=json`,
    },
    "vimeo-video": {
      oembed: (i) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent("https://vimeo.com/" + i)}`,
    },
    "x-status": {
      oembed: (i) => `https://publish.twitter.com/oembed?url=${encodeURIComponent("https://twitter.com/i/status/" + i)}&omit_script=true`,
    },
    "reddit-post": {
      oembed: (i) => `https://www.reddit.com/oembed?url=${encodeURIComponent("https://www.reddit.com/r/" + i + "/")}`,
    },
    "apple-music-song": {
      oembed: (i) => `https://music.apple.com/oembed?url=${encodeURIComponent("https://music.apple.com/song/" + i)}`,
    },
    "apple-music-album": {
      oembed: (i) => `https://music.apple.com/oembed?url=${encodeURIComponent("https://music.apple.com/album/" + i)}`,
    },
    "apple-music-playlist": {
      oembed: (i) => `https://music.apple.com/oembed?url=${encodeURIComponent("https://music.apple.com/playlist/" + i)}`,
    },
    "apple-music-artist": {
      oembed: (i) => `https://music.apple.com/oembed?url=${encodeURIComponent("https://music.apple.com/artist/" + i)}`,
    },
    "github-repo": {
      // GitHub's social preview card — same image WhatsApp/iMessage show natively
      thumbnail: (i) => `https://opengraph.githubassets.com/1/${i}`,
    },
    "pinterest-pin": {
      oembed: (i) => `https://www.pinterest.com/oembed.json?url=${encodeURIComponent("https://www.pinterest.com/pin/" + i + "/")}`,
    },
  };

  const provider = PREVIEW_PROVIDERS[platformKey];
  let finalTitle = config.name || platformKey;
  let finalImage = null;
  let finalDescription = null;

  const buildWebUrl = (template, val) => {
    if (!template) return null;
    const safeVal = val.split('/').map(encodeURIComponent).join('/');
    return template.replace(/\{id\}/g, safeVal);
  };

  const webUrl = buildWebUrl(config.webLink, ID_DECODED);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    // Strategy 1: oEmbed
    if (provider?.oembed) {
      try {
        const oRes = await fetch(provider.oembed(ID_DECODED), { signal: controller.signal });
        if (oRes.ok) {
          const oData = await oRes.json();
          finalTitle       = oData.title || oData.author_name || finalTitle;
          finalImage       = oData.thumbnail_url || null;
          finalDescription = oData.description || null;
        }
      } catch (_) {}
    }

    // Strategy 2: Direct thumbnail (zero-fetch, e.g. YouTube, GitHub)
    if (!finalImage && provider?.thumbnail) {
      finalImage = provider.thumbnail(ID_DECODED);
    }

    // Strategy 3: Native OG scrape — only if still missing image or description
    if ((!finalImage || !finalDescription) && webUrl) {
      try {
        const sRes = await fetch(webUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "facebookexternalhit/1.1; WhatsApp/2.21.12.21 A" }
        });
        if (sRes.ok && sRes.body) {
          const reader = sRes.body.getReader();
          const decoder = new TextDecoder();
          let sHtml = "";
          while (true) {
            const { done, value } = await reader.read();
            if (value) sHtml += decoder.decode(value, { stream: true });
            if (done || sHtml.includes('</head>') || sHtml.length > 50000) {
              try { reader.cancel(); } catch (_) {}
              break;
            }
          }
          if (!finalDescription) {
            const m = sHtml.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
                   || sHtml.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i)
                   || sHtml.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
            if (m?.[1]) finalDescription = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
          }
          if (!finalImage) {
            const m = sHtml.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
                   || sHtml.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
            if (m?.[1]) {
              let src = m[1].replace(/&amp;/g, '&');
              if (src.startsWith('//')) src = 'https:' + src;
              else if (src.startsWith('/')) src = new URL(webUrl).origin + src;
              finalImage = src;
            }
          }
          if (finalTitle === config.name) {
            const m = sHtml.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
                   || sHtml.match(/<title>([^<]+)<\/title>/i);
            if (m?.[1]) finalTitle = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
          }
        }
      } catch (_) {}
    }

    // Strategy 4: Microlink fallback
    if ((!finalImage || !finalDescription) && webUrl) {
      try {
        const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(webUrl)}`, { signal: controller.signal });
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData.status === "success" && mData.data) {
            if (finalTitle === config.name) finalTitle = mData.data.title || finalTitle;
            if (!finalImage && mData.data.image?.url) finalImage = mData.data.image.url;
            if (!finalDescription && mData.data.description) finalDescription = mData.data.description;
          }
        }
      } catch (_) {}
    }

    clearTimeout(timeout);
  } catch (err) {
    console.error(`[og-injector] fetch failed for ${platformKey}:`, err.message);
  }

  // Guaranteed fallback description for every platform
  if (!finalDescription) {
    const kind = (config.kind || "content").toLowerCase();
    finalDescription = `Open this ${kind} on ${config.name}. Tap to open directly in the native app, with a web fallback.`;
  }

  // 4. Fetch the static HTML shell
  const response = await context.next();
  let html = await response.text();

  // 5. Inject — use a replacer function so $ in values is never misinterpreted
  const setAttr = (tag, attr, value) =>
    tag.replace(new RegExp(`(\\s${attr}=")[^"]*(")`), `$1${value}$2`);

  // Replace a specific meta tag's content attribute by its property/name value
  // This is safer than regex on the whole tag — we find the tag, then swap content="..."
  const replaceMeta = (html, selector, newContent) => {
    // selector e.g. 'property="og:title"' or 'name="description"'
    // Matches the whole <meta ... /> tag that contains the selector string
    return html.replace(
      new RegExp(`<meta[^>]+${escapeRegex(selector)}[^>]*>`, 'i'),
      (tag) => tag.replace(/content="[^"]*"/, `content="${newContent}"`)
    );
  };

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  const safeTitle = escHtml(finalTitle);
  const safeDesc  = escHtml(finalDescription.replace(/[\r\n]+/g, ' '));
  const safeImage = finalImage ? escHtml(finalImage) : null;

  // <title>
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle} | Open Deep Redirect</title>`);

  // og: tags
  html = replaceMeta(html, 'property="og:title"',       safeTitle);
  html = replaceMeta(html, 'property="og:description"', safeDesc);
  html = replaceMeta(html, 'property="og:url"',         escHtml(request.url));
  html = replaceMeta(html, 'property="og:type"',        'article');

  // twitter: tags
  html = replaceMeta(html, 'name="twitter:title"',       safeTitle);
  html = replaceMeta(html, 'name="twitter:description"', safeDesc);
  html = replaceMeta(html, 'name="description"',         safeDesc);

  if (safeImage) {
    html = replaceMeta(html, 'property="og:image"',         safeImage);
    html = replaceMeta(html, 'name="twitter:image"',        safeImage);
    html = replaceMeta(html, 'property="og:image:alt"',     safeTitle);
    html = replaceMeta(html, 'name="twitter:image:alt"',    safeTitle);
    // Remove fixed dimensions — image size may differ from the default 1200x630
    html = html.replace(/<meta\s+property="og:image:width"[^>]*>\n?/ig, '');
    html = html.replace(/<meta\s+property="og:image:height"[^>]*>\n?/ig, '');
  }

  // 6. Return
  const newHeaders = new Headers(response.headers);
  newHeaders.set("content-type", "text/html;charset=utf-8");
  return new Response(html, { status: response.status, headers: newHeaders });
}

export const config = { path: "/r/*" };
