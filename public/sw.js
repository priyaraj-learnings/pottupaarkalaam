// Lets phones install PottuPaarkalaam as an app (older Chrome versions want a
// service worker). It keeps nothing offline: every request goes to the network
// exactly as without it.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
