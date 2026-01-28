importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  // precache files
  workbox.precaching.precacheAndRoute([
    {url: '/', revision: '1'},
    {url: '/index.html', revision: '1'},
    {url: '/styles.css', revision: '1'},
    {url: '/main.js', revision: '1'},
    {url: '/manifest.json', revision: '1'},
    {url: '/icons/icon-192.png', revision: '1'},
    {url: '/icons/icon2-676.png', revision: '1'}
  ]);

  // font awesome
  workbox.routing.registerRoute(
    ({url}) => url.origin === 'https://cdnjs.cloudflare.com' && url.pathname.startsWith('/ajax/libs/font-awesome/'),
    new workbox.strategies.CacheFirst({
      cacheName: 'external-cache',
    })
  );

  // google fonts
  workbox.routing.registerRoute(
    ({url}) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new workbox.strategies.CacheFirst({
      cacheName: 'external-cache',
    })
  );
  
  // other internal files, stale while revalidate
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'script' || request.destination === 'style' || request.destination === 'document' || request.destination === 'image',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'internal-cache',
    })
  );
} else {
  console.log('Workbox failed to load');
}