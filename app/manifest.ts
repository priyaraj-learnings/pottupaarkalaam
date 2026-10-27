import type { MetadataRoute } from 'next'

// "Add to Home screen" / "Install app": opens full screen like any other app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PottuPaarkalaam | போட்டுப்பார்க்கலாம்',
    short_name: 'PottuPaarkalaam',
    description: 'Photograph a fabric or a dress, add your photo, and see yourself wearing it.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fdf2f8',
    theme_color: '#9d174d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
