/**
 * Constellation of Us - Service Worker (Offline Cache & PWA Support)
 * Provides reliable offline experience for map, photos, UI styles, and audio soundscapes.
 * Features safe Range Request passthrough for videos and background cache resilience.
 */

const CACHE_NAME = "constellation-cache-v7";

// Core static assets to pre-cache on install (Lightweight core app shell only - NO heavy audio or gallery photos)
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/tailwind.min.css",
  "./data/memories.json",
  "./js/app.js",
  "./js/map.js",
  "./js/modules/rain-fx.js",
  "./js/modules/audio-player.js",
  "./js/modules/secret-puzzle.js",
  "./js/modules/polaroid-modal.js",
  "./js/modules/sidebar.js",
  "./assets/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

// Install Event: Pre-cache local assets safely
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log("[ServiceWorker] Pre-caching core offline assets...");
      // Use individual caching to prevent one 404 from failing the entire cache install
      await Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[ServiceWorker] Failed to pre-cache ${asset}:`, err);
          })
        )
      );
      return self.skipWaiting();
    })
  );
});

// Activate Event: Clean up legacy caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`[ServiceWorker] Removing legacy cache: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Smart offline-first & runtime caching
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests (e.g. POST/PUT) and unsupported schemes (e.g. chrome-extension)
  if (req.method !== "GET" || !req.url.startsWith("http")) {
    return;
  }

  // 0. Video streaming & Non-Audio Range Requests: Bypass SW directly to browser network pipeline
  // Video files are streamed on demand and not stored in Cache API to avoid memory bloat.
  if (
    req.destination === "video" ||
    url.pathname.endsWith(".mp4") ||
    url.pathname.endsWith(".webm") ||
    (req.headers.has("range") && !url.pathname.endsWith(".m4a") && req.destination !== "audio")
  ) {
    return;
  }

  // 1. Navigation requests (HTML documents): Network-First with Cache fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match("./index.html") || caches.match(req);
        })
    );
    return;
  }

  // 2. Data files (memories.json): Stale-While-Revalidate
  if (url.pathname.endsWith("memories.json")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(req).then((cachedRes) => {
          const fetchPromise = fetch(req)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                cache.put(req, networkRes.clone());
              }
              return networkRes;
            })
            .catch(() => cachedRes);

          return cachedRes || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Audio files (.m4a): Dynamic Cache-First with Range Request (206) slice support
  // Loaded on-demand when user plays a track, then cached for offline listening.
  if (req.destination === "audio" || url.pathname.endsWith(".m4a")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedRes = await cache.match(req.url, { ignoreSearch: true });

        const respondSlice = async (fullResponse, rangeStr) => {
          const buffer = await fullResponse.arrayBuffer();
          const match = /bytes=(\d+)-(\d+)?/.exec(rangeStr);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : buffer.byteLength - 1;
            const slice = buffer.slice(start, end + 1);
            return new Response(slice, {
              status: 206,
              statusText: "Partial Content",
              headers: [
                ["Content-Range", `bytes ${start}-${end}/${buffer.byteLength}`],
                ["Content-Type", fullResponse.headers.get("Content-Type") || "audio/mp4"],
                ["Content-Length", slice.byteLength],
                ["Accept-Ranges", "bytes"],
                ["Cache-Control", "public, max-age=31536000"]
              ]
            });
          }
          return fullResponse;
        };

        const range = req.headers.get("range");

        if (cachedRes) {
          if (range) {
            return respondSlice(cachedRes, range);
          }
          return cachedRes;
        }

        try {
          // Fetch full audio stream without range to store complete 200 response in cache
          const cleanReq = new Request(req.url, {
            method: "GET",
            headers: new Headers({ "Accept": "audio/*" }),
            mode: "same-origin"
          });
          const networkRes = await fetch(cleanReq);
          if (networkRes && networkRes.status === 200) {
            await cache.put(req.url, networkRes.clone());
            if (range) {
              return respondSlice(networkRes, range);
            }
            return networkRes;
          }
          return networkRes;
        } catch (err) {
          if (cachedRes) return cachedRes;
          throw err;
        }
      })
    );
    return;
  }

  // 4. Static Assets, Images, Fonts, and CDN Libraries: Cache-First with Runtime Network fallback
  // Photos and gallery images are cached on-demand when viewed.
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        return cachedRes;
      }

      return fetch(req)
        .then((networkRes) => {
          // Only cache valid standard responses or opaque responses (status 0 for 3rd party CDNs)
          if (networkRes && (networkRes.status === 200 || networkRes.type === "opaque")) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, resClone);
            });
          }
          return networkRes;
        })
        .catch((err) => {
          // If offline and request is an image, fallback to cached favicon
          if (req.destination === "image" || url.pathname.match(/\.(jpg|jpeg|png|webp|svg)$/i)) {
            return caches.match("./assets/favicon.svg");
          }
          throw err;
        });
    })
  );
});
