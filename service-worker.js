importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  workbox.routing.registerRoute(
    ({request}) => ['image', 'script', 'style'].includes(request.destination),
    new workbox.strategies.StaleWhileRevalidate()
  );
} else {
  console.log('Workbox failed to load');
}