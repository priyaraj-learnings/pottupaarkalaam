import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

import './globals.css'

import VisitCounter from '@/components/VisitCounter'

// Tamil text (the name, போட்டுப்பார்க்கலாம்) in Noto Sans Tamil, kept in
// app/fonts. Latin text uses the phone's own font.
const notoTamil = localFont({
  src: [{ path: './fonts/noto-sans-tamil.woff2', weight: '400 900', style: 'normal' }],
  variable: '--font-noto-tamil',
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0964-0965, U+0B82-0BFA, U+200C-200D, U+20B9, U+25CC' }],
})

const isUat = process.env.NEXT_PUBLIC_APP_ENV === 'uat'

export const metadata: Metadata = {
  metadataBase: new URL('https://pp.inaivuit.com'),
  title: {
    default: 'PottuPaarkalaam | போட்டுப்பார்க்கலாம் | Try clothes on yourself',
    template: '%s | PottuPaarkalaam',
  },
  description: 'Photograph a fabric or a dress, add your photo, and see yourself wearing it. Free try-ons every month.',
  applicationName: 'PottuPaarkalaam',
  appleWebApp: { capable: true, title: 'PottuPaarkalaam', statusBarStyle: 'default' },
  robots: isUat ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: '/',
    siteName: 'PottuPaarkalaam | போட்டுப்பார்க்கலாம்',
    title: 'PottuPaarkalaam | See yourself in it before you stitch or buy',
    description: 'Photograph a fabric or a dress, add your photo, and see yourself wearing it.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'PottuPaarkalaam virtual try-on' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#c2185b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${notoTamil.variable} h-full antialiased`}>
      <body className="min-h-full bg-ivory text-stone-900">
        {children}
        <VisitCounter />
      </body>
    </html>
  )
}
