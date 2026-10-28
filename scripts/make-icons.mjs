// Makes the app icons and the link preview from public/logo.svg.
// Run after changing the logo: npm run icons (the PNGs are committed).
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const logo = Buffer.from(readFileSync('public/logo.svg', 'utf8'))
const clear = { r: 0, g: 0, b: 0, alpha: 0 }

// The peacock at `scale` of the icon, on a transparent or white square.
// Phones round (or mask) home-screen icons themselves.
async function icon(size, scale, out, background = null) {
  const inner = Math.round(size * scale)
  const mark = await sharp(logo, { density: 300 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: background ?? clear } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(out)
}

const white = { r: 255, g: 255, b: 255, alpha: 1 }
await icon(192, 0.92, 'public/icons/icon-192.png')
await icon(512, 0.92, 'public/icons/icon-512.png')
// Maskable icons are cropped to a circle or squircle: keep the peacock well
// inside the middle 80%.
await icon(512, 0.64, 'public/icons/icon-maskable-512.png', white)
await icon(256, 0.98, 'app/icon.png')
await icon(180, 0.8, 'app/apple-icon.png', white)

// Link preview (WhatsApp, Facebook): 1200 x 630.
const preview = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF8F1"/>
      <stop offset="1" stop-color="#FCE4EE"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#B3124F"/>
      <stop offset="0.6" stop-color="#E0337A"/>
      <stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="440" y="270" font-family="DejaVu Sans, Arial, sans-serif" font-size="70" font-weight="700" fill="url(#ink)">PottuPaarkalaam</text>
  <text x="440" y="345" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#2A1520">See yourself in it before you stitch or buy.</text>
  <text x="440" y="420" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#6B5560">Fabric or dress  +  your photo  =  you, wearing it</text>
  <text x="440" y="500" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" fill="#A3134D">pp.inaivuit.com</text>
</svg>`
await sharp(Buffer.from(preview))
  .composite([{ input: await sharp(logo, { density: 300 }).resize(330, 330).png().toBuffer(), left: 70, top: 150 }])
  .png()
  .toFile('public/og-image.png')

console.log('Icons and link preview written.')
