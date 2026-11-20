// service worker minimal : rend le site installable ; tout passe par le réseau (jamais de vieille version en cache)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
