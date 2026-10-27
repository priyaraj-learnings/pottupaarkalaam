// Makes the app icons and the link preview from public/logo.svg.
// Run after changing the logo: npm run icons (the PNGs are committed).
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const logo = readFileSync('public/logo.svg', 'utf8')

// Square corners: phones round (or mask) home-screen icons themselves.
const square = logo.replace('rx="116"', 'rx="0"')

// Maskable icons are cropped to a circle or squircle: keep the mark inside the
// middle 80% and let the background fill the edges.
const maskable = square.replace(
  /(<rect[^>]*\/>)([\s\S]*)(<\/svg>)/,
  (_all, rect, mark, end) => `${rect}<g transform="translate(51.2 51.2) scale(0.8)">${mark}</g>${end}`
)

const png = (svg, size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out)

await png(logo, 192, 'public/icons/icon-192.png')
await png(logo, 512, 'public/icons/icon-512.png')
await png(maskable, 512, 'public/icons/icon-maskable-512.png')
await png(logo, 256, 'app/icon.png')
await png(square, 180, 'app/apple-icon.png')

// Link preview (WhatsApp, Facebook): 1200 x 630.
const mark = Buffer.from(logo)
const preview = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fdf2f8"/>
      <stop offset="1" stop-color="#fff7ed"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9d174d"/>
      <stop offset="1" stop-color="#f97316"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="420" y="270" font-family="DejaVu Sans, Arial, sans-serif" font-size="70" font-weight="700" fill="url(#ink)">PottuPaarkalaam</text>
  <text x="420" y="345" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#44403c">See yourself in it before you stitch or buy.</text>
  <text x="420" y="420" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#78716c">Fabric or dress  +  your photo  =  you, wearing it</text>
  <text x="420" y="500" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" fill="#9d174d">pp.inaivuit.com</text>
</svg>`
await sharp(Buffer.from(preview))
  .composite([{ input: await sharp(mark).resize(300, 300).png().toBuffer(), left: 80, top: 165 }])
  .png()
  .toFile('public/og-image.png')

console.log('Icons and link preview written.')
