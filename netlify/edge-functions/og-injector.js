export default async function (request, context) {
  // 1. Parse URL to get platform and id from /r/{platform}/{id}
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/r\/([^\/]+)\/(.+)$/);
  
  if (!match) {
    // Not a valid route, let the normal static routing handle it
    return context.next();
  }

  const platformKey = decodeURIComponent(match[1]);
  const id = match[2]; // keep url-encoded format for id since it may contain slashes

  // 2. Fetch the platforms config
  let config;
  try {
    const configRes = await fetch(new URL("/platforms.json", request.url));
    if (!configRes.ok) throw new Error("Failed to fetch platforms config");
    const json = await configRes.json();
    config = json.platforms[platformKey];
  } catch (err) {
    console.error("Error reading platforms.json in edge function:", err);
    return context.next();
  }

  // If the platform isn't valid, just return the default page
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

  // Function to gracefully interpolate the webLink URL 
  const buildWebUrl = (template, val) => {
    if (!template) return null;
    return template.replace(/\{id\}/g, encodeURIComponent(val));
  };

  // Waterfall strategy to fetch metadata
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500); // Strict 2.5s timeout for Edge Function

    if (provider && provider.oembed) {
      // Strategy 1: oEmbed
      const oRes = await fetch(provider.oembed(ID_DECODED), { signal: controller.signal });
      if (oRes.ok) {
        const oData = await oRes.json();
        finalTitle = oData.title || oData.author_name || finalTitle;
        finalImage = oData.thumbnail_url || (provider.thumbnail ? provider.thumbnail(ID_DECODED) : null);
      }
    } else if (provider && provider.thumbnail) {
      // Strategy 2: Direct Thumbnail
      finalImage = provider.thumbnail(ID_DECODED);
    } else {
      // Strategy 3: Microlink fallback
      const webUrl = buildWebUrl(config.webLink, ID_DECODED);
      if (webUrl) {
        const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(webUrl)}`, { signal: controller.signal });
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData.status === "success" && mData.data) {
            finalTitle = mData.data.title || finalTitle;
            if (mData.data.image && mData.data.image.url) {
              finalImage = mData.data.image.url;
            }
          }
        }
      }
    }
    clearTimeout(timeout);
  } catch (err) {
    // Either aborted due to timeout or fetch error. In either case, degrade gracefully.
    console.error(`Edge fetch failed for ${platformKey}:`, err.message);
  }

  // 4. Get the default HTML response from Netlify's static host
  const response = await context.next();
  let html = await response.text();

  // 5. Inject the metadata into the raw HTML string
  const cleanTitle = finalTitle.replace(/"/g, '&quot;');
  const titleTag = `<title>${cleanTitle} | Open Deep Redirect</title>`;
  
  html = html.replace(/<title>.*?<\/title>/, titleTag);
  html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${cleanTitle}"`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${cleanTitle}"`);

  if (finalImage) {
    const cleanImage = finalImage.replace(/"/g, '&quot;');
    html = html.replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${cleanImage}"`);
    html = html.replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${cleanImage}"`);
  }

  // 6. Return the mutated HTML
  return new Response(html, {
    headers: { "content-type": "text/html;charset=utf-8" }
  });
}

// Config blocks dictate what paths this function runs on
export const config = {
  path: "/r/*"
};
