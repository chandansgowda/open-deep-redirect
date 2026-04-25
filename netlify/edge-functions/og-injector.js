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
    // Use for platforms with no Native oEmbed, or if previous strategies failed to fetch the description/image.
    if (!finalImage || !finalDescription) {
      const webUrl = buildWebUrl(config.webLink, ID_DECODED);
      if (webUrl) {
        const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(webUrl)}`, { signal: controller.signal });
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData.status === "success" && mData.data) {
            finalTitle = mData.data.title || finalTitle;
            if (mData.data.image && mData.data.image.url) {
              finalImage = mData.data.image.url || finalImage;
            }
            if (mData.data.description) {
              finalDescription = mData.data.description || finalDescription;
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
  const escapeReplacement = (str) => str.replace(/\$/g, '$$$$');

  const cleanTitle = finalTitle.replace(/"/g, '&quot;');
  const cleanTitleStr = escapeReplacement(cleanTitle);
  const titleTag = escapeReplacement(`<title>${cleanTitle} | Open Deep Redirect</title>`);
  
  html = html.replace(/<title>.*?<\/title>/i, titleTag);
  html = html.replace(/<meta[^>]*property="og:title"[^>]*>/i, `<meta property="og:title" content="${cleanTitleStr}" />`);
  html = html.replace(/<meta[^>]*name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${cleanTitleStr}" />`);

  if (finalImage) {
    const cleanImage = finalImage.replace(/"/g, '&quot;');
    const cleanImageStr = escapeReplacement(cleanImage);
    html = html.replace(/<meta[^>]*property="og:image"[^>]*>/i, `<meta property="og:image" content="${cleanImageStr}" />`);
    html = html.replace(/<meta[^>]*name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${cleanImageStr}" />`);
    
    html = html.replace(/<meta[^>]*property="og:image:width"[^>]*>/ig, '');
    html = html.replace(/<meta[^>]*property="og:image:height"[^>]*>/ig, '');
  }

  // Provide a smart fallback for description if the platform didn't return one (like YouTube oEmbed)
  if (!finalDescription) {
    finalDescription = `Redirect link to ${finalTitle} on ${config.name}`;
  }

  if (finalDescription) {
    const cleanDesc = finalDescription.replace(/[\r\n]+/g, ' ').replace(/"/g, '&quot;');
    const cleanDescStr = escapeReplacement(cleanDesc);
    html = html.replace(/<meta[^>]*name="description"[^>]*>/i, `<meta name="description" content="${cleanDescStr}" />`);
    html = html.replace(/<meta[^>]*property="og:description"[^>]*>/i, `<meta property="og:description" content="${cleanDescStr}" />`);
    html = html.replace(/<meta[^>]*name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${cleanDescStr}" />`);
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
