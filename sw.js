// Minimal service worker — satisfies PWA "installable" requirements.
// Uses a simple network-first strategy (no aggressive offline caching,
// since this site depends on live Supabase/Vapi connections anyway).

const CACHE_NAME = "prepvida-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
