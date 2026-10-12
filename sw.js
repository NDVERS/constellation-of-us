/**
 * Constellation of Us - Service Worker (Offline Cache & PWA Support)
 * Provides reliable offline experience for map, photos, UI styles, and audio soundscapes.
 * Features safe Range Request passthrough for videos and background cache resilience.
 */

const CACHE_NAME = "constellation-cache-v6";

// Core static assets to pre-cache on install (Images, HTML, CSS, Scripts, Data, Curated Audio - NO video files in pre-cache)
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./data/memories.json",
  "./js/app.js",
  "./js/map.js",
  "./js/modules/rain-fx.js",
  "./js/modules/audio-player.js",
  "./js/modules/secret-puzzle.js",
  "./js/modules/polaroid-modal.js",
  "./js/modules/sidebar.js",
  "./assets/audio/the-1975-about-you.m4a",
  "./assets/audio/daniel-caesar-best-part.m4a",
  "./assets/audio/cas-apocalypse.m4a",
  "./assets/audio/banda-neira-sampai-jadi-debu.m4a",
  "./assets/favicon.svg",
  "./assets/images/og-preview.jpg",
  "./assets/images/secret-night.jpg",
  "./assets/images/surat-asli-ayumi-keira.jpg",
  "./assets/images/paskal/paskal-1.jpg",
  "./assets/images/paskal/paskal-spiderman.jpg",
  "./assets/images/ciwalk/ciwalk-1.jpg",
  "./assets/images/ciwalk/ciwalk-chikuro.jpg",
  "./assets/images/ciwalk/ciwalk-clay.jpg",
  "./assets/images/ciwalk/ciwalk-clay-result.jpg",
  "./assets/images/ciwalk/ciwalk-gigglebox.jpg",
  "./assets/images/ciwalk/ciwalk-heartwarmer.jpg",
  "./assets/images/ciwalk/ciwalk-jco.jpg",
  "./assets/images/ciwalk/ciwalk-kafe-fore.jpg",
  "./assets/images/ciwalk/ciwalk-main.jpg",
  "./assets/images/ciwalk/ciwalk-nonton.jpg",
  "./assets/images/ciwalk/ciwalk-skywalk.jpg",
  "./assets/images/gacoan/gacoan-padasuka-depan.jpg",
  "./assets/images/gacoan/gacoan-kanvas-paus.jpg",
  "./assets/images/gacoan/gacoan-mie-pedas.jpg",
  "./assets/images/gacoan/gacoan-hoodie-biru.jpg",
  "./assets/images/milkyverse/milkyverse-lempar-sasaran.jpg",
  "./assets/images/upperside/upperside-sign-rooftop.jpg",
  "./assets/images/upperside/upperside-naik-tangga.jpg",
  "./assets/images/upperside/upperside-mrdiy-capybara.jpg",
  "./assets/images/upperside/upperside-mrdiy-lorong.jpg",
  "./assets/images/upperside/upperside-kado-meja.jpg",
  "./assets/images/upperside/upperside-kado-bricks-kue.jpg",
  "./assets/images/upperside/upperside-kado-bricks-nick.jpg",
  "./assets/images/upperside/upperside-kado-keychain-kucing.jpg",
  "./assets/images/upperside/upperside-kado-musicbox.jpg",
  "./assets/images/upperside/upperside-kado-boneka-gurita.jpg",
  "./assets/images/upperside/upperside-kado-buku-memory.jpg",
  "./assets/images/upperside/upperside-citylight-view.jpg",
  "./assets/images/upperside/upperside-matcha-citylight.jpg"
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

  // 0. Video streaming & Range Requests: Bypass SW cache directly to browser network pipeline
  // This prevents HTTP 206 partial content errors on iOS Safari and mobile Chrome.
  if (
    req.destination === "video" ||
    url.pathname.endsWith(".mp4") ||
    url.pathname.endsWith(".webm") ||
    req.headers.has("range")
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

  // 3. Static Assets, Images, Fonts, and CDN Libraries (Leaflet, Lucide, Tailwind, Map Tiles): Cache-First with Runtime Network fallback
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
          // If offline and request is an image, fallback to cached og-preview or favicon
          if (req.destination === "image") {
            return caches.match("./assets/favicon.svg");
          }
          throw err;
        });
    })
  );
});
