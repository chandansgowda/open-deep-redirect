import siteConfig from "../../platforms.json" with { type: "json" };

export default async function (request, context) {
  // 1. Parse URL to get platform and id from /r/{platform}/{id}
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/r\/([^\/]+)\/(.+)$/);

  if (!match) {
    return context.next();
  }

  const platformKey = decodeURIComponent(match[1]);
  const id = match[2];

  // 2. Read the platform config
  const config = siteConfig.platforms[platformKey];
  if (!config) return context.next();

  // 3. Replicate PREVIEW_PROVIDERS logic locally
  const ID_DECODED = decodeURIComponent(id);
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
      thumbnail: (i) => `https://github.com/${i.split("/")[0]}.png?size=200`,
    },
    "pinterest-pin": {
      oembed: (i) => `https://www.pinterest.com/oembed.json?url=${encodeURIComponent("https://www.pinterest.com/pin/" + i + "/")}`,
    },
  };

  const provider = PREVIEW_PROVIDERS[platformKey];
  let finalTitle = config.name || platformKey;
  let finalImage = null;
  let finalDescription = null;

  // Interpolate webLink template, preserving path slashes
  const buildWebUrl = (template, val) => {
    if (!template) return null;
    const safeVal = val.split('/').map(encodeURIComponent).join('/');
    return template.replace(/\{id\}/g, safeVal);
  };

  // Waterfall strategy to fetch metadata
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    // Strategy 1: oEmbed
    if (provider && provider.oembed) {
      try {
        const oRes = await fetch(provider.oembed(ID_DECODED), { signal: controller.signal });
        if (oRes.ok) {
          const oData = await oRes.json();
          finalTitle = oData.title || oData.author_name || finalTitle;
          finalImage = oData.thumbnail_url || null;
          finalDescription = oData.description || null;
        }
      } catch (e) {}
    }

    // Strategy 2: Fast Native Scrape (reads og: meta tags from the page head)
    const webUrl = buildWebUrl(config.webLink, ID_DECODED);
    if ((!finalDescription || !finalImage) && webUrl) {
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
              try { reader.cancel(); } catch (e) {}
              break;
            }
          }
          if (!finalDescription) {
            const descMatch = sHtml.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
              || sHtml.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i)
              || sHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
            if (descMatch && descMatch[1]) {
              finalDescription = descMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
            }
          }
          if (!finalTitle || finalTitle === config.name) {
            const titleMatch = sHtml.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
              || sHtml.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              finalTitle = titleMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
            }
          }
          if (!finalImage) {
            const imgMatch = sHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
              || sHtml.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
            if (imgMatch && imgMatch[1]) {
              let src = imgMatch[1].replace(/&amp;/g, '&');
              if (src.startsWith('//')) src = 'https:' + src;
              else if (src.startsWith('/')) src = new URL(webUrl).origin + src;
              finalImage = src;
            }
          }
        }
      } catch (err) {}
    }

    // Strategy 3: Direct thumbnail (e.g. YouTube, GitHub)
    if (!finalImage && provider && provider.thumbnail) {
      finalImage = provider.thumbnail(ID_DECODED);
    }

    // Strategy 4: Microlink fallback
    if ((!finalImage || !finalDescription) && webUrl) {
      try {
        const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(webUrl)}`, { signal: controller.signal });
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData.status === "success" && mData.data) {
            if (!finalTitle || finalTitle === config.name) finalTitle = mData.data.title || finalTitle;
            if (!finalImage && mData.data.image && mData.data.image.url) finalImage = mData.data.image.url;
            if (!finalDescription && mData.data.description) finalDescription = mData.data.description;
          }
        }
      } catch (e) {}
    }

    clearTimeout(timeout);
  } catch (err) {
    console.error(`Edge fetch failed for ${platformKey}:`, err.message);
  }

  // Guaranteed fallback description — always set for every platform
  if (!finalDescription) {
    const kind = config.kind || "content";
    finalDescription = `Open this ${kind.toLowerCase()} on ${config.name}. Tap to open directly in the native app, with a web fallback.`;
  }

  // 4. Get the default HTML from Netlify's static host
  const response = await context.next();
  let html = await response.text();

  // 5. Inject metadata
  // Helper: escape $ so they aren't treated as regex back-references
  const esc = (str) => str.replace(/\$/g, '$$$$');

  const safeTitle = finalTitle.replace(/"/g, '&quot;');
  const safeDesc  = finalDescription.replace(/[\r\n]+/g, ' ').replace(/"/g, '&quot;');
  const pageUrl   = request.url;

  // <title>
  html = html.replace(/<title>[^<]*<\/title>/i, esc(`<title>${safeTitle} | Open Deep Redirect</title>`));

  // og: tags — use \s+ after <meta to avoid matching og:image:alt when targeting og:image
  html = html.replace(/<meta\s+property="og:title"[^>]*>/i,       esc(`<meta property="og:title" content="${safeTitle}" />`));
  html = html.replace(/<meta\s+property="og:description"[^>]*>/i, esc(`<meta property="og:description" content="${safeDesc}" />`));
  html = html.replace(/<meta\s+property="og:url"[^>]*>/i,         esc(`<meta property="og:url" content="${pageUrl}" />`));
  html = html.replace(/<meta\s+property="og:type"[^>]*>/i,        esc(`<meta property="og:type" content="article" />`));

  // twitter: tags
  html = html.replace(/<meta\s+name="twitter:title"[^>]*>/i,       esc(`<meta name="twitter:title" content="${safeTitle}" />`));
  html = html.replace(/<meta\s+name="twitter:description"[^>]*>/i, esc(`<meta name="twitter:description" content="${safeDesc}" />`));
  html = html.replace(/<meta\s+name="description"[^>]*>/i,         esc(`<meta name="description" content="${safeDesc}" />`));

  // Image injection
  if (finalImage) {
    const safeImage = finalImage.replace(/"/g, '&quot;');
    // Match og:image exactly — the tag in index.html is:
    //   <meta property="og:image" content="..." />
    // Use a tight pattern so og:image:type / og:image:alt / og:image:width are NOT touched here
    html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/i, esc(`<meta property="og:image" content="${safeImage}" />`));
    html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/>/i, esc(`<meta name="twitter:image" content="${safeImage}" />`));
    // Update alt tags
    html = html.replace(/<meta\s+property="og:image:alt"[^>]*>/i,  esc(`<meta property="og:image:alt" content="${safeTitle}" />`));
    html = html.replace(/<meta\s+name="twitter:image:alt"[^>]*>/i, esc(`<meta name="twitter:image:alt" content="${safeTitle}" />`));
    // Remove fixed dimensions — crawlers may reject mismatched sizes
    html = html.replace(/<meta\s+property="og:image:width"[^>]*>\n?/ig, '');
    html = html.replace(/<meta\s+property="og:image:height"[^>]*>\n?/ig, '');
  }

  // 6. Return mutated HTML, preserving original response headers
  const newHeaders = new Headers(response.headers);
  newHeaders.set("content-type", "text/html;charset=utf-8");

  return new Response(html, {
    status: response.status,
    headers: newHeaders,
  });
}

export const config = {
  path: "/r/*"
};
