import Image from 'next/image'

// The PottuPaarkalaam peacock (public/logo.svg: a sibling of UduthiPaar's, facing
// the other way) and the full name in English and Tamil. The address stays
// short (pp.inaivuit.com); the name is always written out in full.

export function LogoMark({ size = 40, tile = false, className = '' }: { size?: number; tile?: boolean; className?: string }) {
  // tile: on a white rounded square, for coloured backgrounds.
  if (tile) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-[22%] bg-white ${className}`} style={{ width: size, height: size }}>
        <Image src="/logo.svg" alt="" width={Math.round(size * 0.82)} height={Math.round(size * 0.82)} loading="eager" />
      </span>
    )
  }
  return <Image src="/logo.svg" alt="" width={size} height={size} loading="eager" className={`shrink-0 ${className}`} />
}

export function Wordmark({ large = false, light = false }: { large?: boolean; light?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className={`${large ? 'text-3xl' : 'text-lg'} font-black tracking-tight ${light ? 'text-white' : 'brand-text'}`}>
        PottuPaarkalaam
      </span>
      <span lang="ta" className={`font-tamil ${large ? 'text-base' : 'text-[11px]'} font-semibold ${light ? 'text-brand-50' : 'text-stone-500'}`}>
        போட்டுப்பார்க்கலாம்
      </span>
    </span>
  )
}
