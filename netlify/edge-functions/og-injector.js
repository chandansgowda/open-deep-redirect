import siteConfig from "../../platforms.json" with { type: "json" };

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

  // 2. Read the platform config from the imported JSON
  const config = siteConfig.platforms[platformKey];

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
  let finalDescription = null;

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
        finalImage = oData.thumbnail_url || null;
        finalDescription = oData.description || null;
      }
    }
    
    // Strategy 2: Direct Thumbnail Fallback
    // If oEmbed failed (e.g. rate limit) or didn't return an image, try direct thumbnail.
    if (!finalImage && provider && provider.thumbnail) {
      finalImage = provider.thumbnail(ID_DECODED);
    }
    
    // Strategy 3: Microlink fallback
    // Only use for platforms that have no Native oEmbed OR if we still have absolutely nothing
    if (!provider?.oembed && !provider?.thumbnail) {
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
            if (mData.data.description) {
              finalDescription = mData.data.description;
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

  if (finalDescription) {
    const cleanDesc = finalDescription.replace(/[\r\n]+/g, ' ').replace(/"/g, '&quot;');
    html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${cleanDesc}"`);
    html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${cleanDesc}"`);
    html = html.replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${cleanDesc}"`);
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
