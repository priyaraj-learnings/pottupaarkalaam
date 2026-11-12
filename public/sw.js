// Lets phones install PottuPaarkalaam as an app (older Chrome versions want a
// service worker), and shows "your picture is ready" notifications. It keeps
// nothing offline: every request goes to the network exactly as without it.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

// The language the customer chose (saved by the app in this cache).
async function language() {
  try {
    const cache = await caches.open('pp-settings')
    const saved = await cache.match('/__pp-lang')
    return saved ? (await saved.text()) : 'en'
  } catch {
    return 'en'
  }
}

// The push carries no data: it only means "a try is finished".
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    // Browsers want every push to show a notification, even with the app open.
    const ta = (await language()) === 'ta'
    await self.registration.showNotification(ta ? 'உங்கள் படம் தயார் ✨' : 'Your picture is ready ✨', {
      body: ta ? 'PottuPaarkalaam-இல் பார்க்கத் தொடுங்கள்.' : 'Tap to see it in PottuPaarkalaam.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'picture-ready',
      renotify: true,
      data: { url: '/?tab=history' },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        client.postMessage({ type: 'open-history' })
        return client.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
