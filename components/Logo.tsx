// The PottuPaarkalaam mark (public/logo.svg) and the full name in English and
// Tamil. The address stays short (pp.inaivuit.com); the name is always written
// out in full.

export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pp-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9d174d" />
          <stop offset="0.55" stopColor="#db2777" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#pp-mark-bg)" />
      <path d="M256 170 V150 C256 130 270 116 288 116 C305 116 318 129 318 146 C318 162 306 172 291 174" fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round" />
      <path d="M256 170 L122 244 C110 251 115 268 128 268 H384 C397 268 402 251 390 244 Z" fill="none" stroke="#fff" strokeWidth="16" strokeLinejoin="round" />
      <path d="M200 268 H230 Q256 300 282 268 H312 L298 334 L352 430 Q356 442 344 442 H168 Q156 442 160 430 L214 334 Z" fill="#fff" />
      <path d="M214 334 H298" stroke="#fdba74" strokeWidth="12" strokeLinecap="round" />
      <path d="M396 104 L407 131 L434 142 L407 153 L396 180 L385 153 L358 142 L385 131 Z" fill="#fde68a" />
    </svg>
  )
}

export function Wordmark({ large = false, light = false }: { large?: boolean; light?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className={`${large ? 'text-3xl' : 'text-lg'} font-black tracking-tight ${light ? 'text-white' : 'brand-text'}`}>
        PottuPaarkalaam
      </span>
      <span lang="ta" className={`font-tamil ${large ? 'text-base' : 'text-[11px]'} font-semibold ${light ? 'text-pink-100' : 'text-stone-500'}`}>
        போட்டுப்பார்க்கலாம்
      </span>
    </span>
  )
}
