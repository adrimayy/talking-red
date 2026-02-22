// This service worker is required to expose an exported Godot project as a
// Progressive Web App. It provides an offline fallback page telling the user
// that they need an Internet connection to run the project if desired.
// Incrementing CACHE_VERSION will kick off the install event and force
// previously cached resources to be updated from the network.
const CACHE_VERSION = "1711432758|3252374038";
const CACHE_PREFIX = "Talking Red-sw-cache-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const OFFLINE_URL = "index.offline.html";
// Files that will be cached on load.
const CACHED_FILES = ["index.html","index.js","index.offline.html","index.icon.png","index.apple-touch-icon.png"];
// Files that we might not want the user to preload, and will only be cached on first load.
const CACHABLE_FILES = ["index.wasm","index.pck"];
const FULL_CACHE = CACHED_FILES.concat(CACHABLE_FILES);

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CACHED_FILES)));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then(
		function (keys) {
			// Remove old caches.
			return Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key != CACHE_NAME).map(key => caches.delete(key)));
		}).then(function() {
			// Enable navigation preload if available.
			return ("navigationPreload" in self.registration) ? self.registration.navigationPreload.enable() : Promise.resolve();
		})
	);
});

async function fetchAndCache(event, cache, isCachable) {
	// Use the preloaded response, if it's there
	let response = await event.preloadResponse;
	if (!response) {
		// Or, go over network.
		response = await self.fetch(event.request);
	}
	if (isCachable) {
		// And update the cache
		cache.put(event.request, response.clone(), {ttl: Number.MAX_SAFE_INTEGER}); // Set a very large TTL
	}
	return response;
}

self.addEventListener("fetch", (event) => {
    event.respondWith(async function () {
        try {
            // Always fetch the newest version from the network when online
            const response = await fetch(event.request);
            // Cache the fetched response for future use
            if (response.ok) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(event.request, response.clone(), {ttl: Number.MAX_SAFE_INTEGER}); // Set a very large TTL

            }
            return response;
        } catch (error) {
            // If an error occurs (e.g., no network connection), serve the cached version
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) {
                return cachedResponse;
            } else {
                // If the resource is not found in the cache, return a generic offline response
                return new Response(null, { status: 404, statusText: "404" });
										

            }
        }
    }());
});

self.addEventListener("message", (event) => {
	// No cross origin
	if (event.origin != self.origin) {
		return;
	}
	const id = event.source.id || "";
	const msg = event.data || "";
	// Ensure it's one of our clients.
	self.clients.get(id).then(function (client) {
		if (!client) {
			return; // Not a valid client.
		}
		if (msg === "claim") {
			self.skipWaiting().then(() => self.clients.claim());
		} else if (msg === "clear") {
			caches.delete(CACHE_NAME);
		} else if (msg === "update") {
			self.skipWaiting().then(() => self.clients.claim()).then(() => self.clients.matchAll()).then(all => all.forEach(c => c.navigate(c.url)));
		} else {
			onClientMessage(event);
		}
	});
});

