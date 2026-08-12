const CACHE_NAME = "servercult-cache-v-1786326170";
const urlsToCache = [
  '/',
  '/css/style.css',
  '/images/backgrounds/000.gif',
  '/images/backgrounds/001.jpeg',
  '/images/backgrounds/003.webp',
  '/images/backgrounds/005.webp',
  '/images/backgrounds/007.webp',
  '/images/backgrounds/kitty.png',
  '/images/backgrounds/manifest.json',
  '/images/backgrounds/sus.webp',
  '/images/briefcase.gif',
  '/images/cat-illustration.gif',
  '/images/clothes/froggo.png',
  '/images/happy-cat.gif',
  '/images/icon-grey.png',
  '/images/icon-white.png',
  '/images/instagram.svg',
  '/images/pause.gif',
  '/images/play.gif',
  '/images/spikeball.gif',
  '/js/config.js',
  '/js/main.js',
  '/js/menus/account.js',
  '/js/menus/backup.js',
  '/js/menus/dashboard.js',
  '/js/menus/deploy.js',
  '/js/menus/domain.js',
  '/js/menus/machine.js',
  '/js/menus/site.js',
  '/js/menus/subscription.js',
  '/js/menus/usage.js',
  '/js/pages/editor.js',
  '/js/pages/landing.js',
  '/js/pages/menu.js',
  '/js/pages/prompt.js',
  '/js/pages/terminal.js',
  '/js/service-worker.js',
  '/js/strings.js',
  '/manifest.json',
  '/templates/about.html',
  '/templates/menu.html',
  '/templates/privacy.html',
  '/templates/tos.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Only handle requests for same-origin resources.
  // This prevents the service worker from interfering with API calls to other domains.
  if (new URL(event.request.url).origin !== self.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
}); 
