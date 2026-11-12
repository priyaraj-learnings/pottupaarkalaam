'use client'

// "Help me choose": up to 4 finished pictures in one image, numbered 1 to 4,
// to send to family on WhatsApp ("Reply 1, 2 or 3"). Each picture keeps its own
// "AI-generated" label (IT Rules 2021, rule 3(3)); the footer says so too.

const WIDTH = 1080
const GAP = 12
const HEADER = 150
const FOOTER = 90
const BRAND = '#9f1239'

async function bitmap(blob: Blob) {
  return createImageBitmap(blob)
}

// Columns and rows for 2, 3 or 4 pictures.
export function collageLayout(count: number) {
  if (count <= 1) return { columns: 1, rows: 1 }
  if (count === 2) return { columns: 2, rows: 1 }
  if (count === 3) return { columns: 3, rows: 1 }
  return { columns: 2, rows: 2 }
}

export async function makeCollage(blobs: Blob[], title: string, footer: string): Promise<Blob> {
  const images = await Promise.all(blobs.slice(0, 4).map(bitmap))
  const { columns, rows } = collageLayout(images.length)
  const cell = Math.floor((WIDTH - GAP * (columns + 1)) / columns)
  // Pictures are portrait (2:3).
  const cellHeight = Math.round(cell * 1.5)
  const height = HEADER + rows * cellHeight + (rows + 1) * GAP + FOOTER
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This phone cannot make the picture.')

  context.fillStyle = '#fdf6f0'
  context.fillRect(0, 0, WIDTH, height)
  context.fillStyle = BRAND
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 54px system-ui, "Noto Sans Tamil", sans-serif'
  context.fillText(title, WIDTH / 2, HEADER / 2, WIDTH - 40)

  images.forEach((image, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = GAP + column * (cell + GAP)
    const y = HEADER + GAP + row * (cellHeight + GAP)
    // Cover the cell, cropping the edges if the picture is not 2:3.
    const scale = Math.max(cell / image.width, cellHeight / image.height)
    const width = image.width * scale
    const heightScaled = image.height * scale
    context.save()
    context.beginPath()
    context.roundRect(x, y, cell, cellHeight, 24)
    context.clip()
    context.drawImage(image, x + (cell - width) / 2, y + (cellHeight - heightScaled) / 2, width, heightScaled)
    context.restore()
    // The number.
    const radius = columns === 3 ? 40 : 52
    context.beginPath()
    context.arc(x + radius + 14, y + radius + 14, radius, 0, Math.PI * 2)
    context.fillStyle = BRAND
    context.fill()
    context.lineWidth = 6
    context.strokeStyle = '#ffffff'
    context.stroke()
    context.fillStyle = '#ffffff'
    context.font = `bold ${Math.round(radius * 1.2)}px system-ui, sans-serif`
    context.fillText(String(index + 1), x + radius + 14, y + radius + 16)
    image.close()
  })

  context.fillStyle = '#57534e'
  context.font = '600 32px system-ui, "Noto Sans Tamil", sans-serif'
  context.fillText(footer, WIDTH / 2, height - FOOTER / 2, WIDTH - 40)

  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('This phone cannot make the picture.'))), 'image/jpeg', 0.9))
}
