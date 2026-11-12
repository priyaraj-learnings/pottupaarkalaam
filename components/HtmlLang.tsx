'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { useLanguage } from '@/lib/client/language'

// <html lang> follows the language the customer chose, so screen readers read
// Tamil correctly and the Tamil text sizes in globals.css apply. /admin is
// English only.
export function HtmlLang() {
  const language = useLanguage()
  const admin = usePathname()?.startsWith('/admin') ?? false
  useEffect(() => {
    document.documentElement.lang = admin ? 'en' : language
  }, [language, admin])
  return null
}
