import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CONSENT_POINTS, CONSENT_POINTS_TA, CONSENT_SCREEN } from '@/lib/legal'
import { termsDue, TERMS_VERSION } from '@/lib/rules'

import agreed from './terms-fingerprint.json'

// Everyone is asked to agree again only when TERMS_VERSION changes, so a change
// to the words people agree to must come with a new version. If this fails:
//   1. set TERMS_VERSION in lib/rules.ts (and TERMS_EFFECTIVE in lib/legal.ts)
//      to the day of the change, then
//   2. put the new version and the fingerprint printed below in
//      tests/terms-fingerprint.json.
const AGREED_TEXT = ['components/legal/TermsContent.tsx', 'components/legal/PrivacyContent.tsx', 'components/legal/PrivacyContentTa.tsx', 'lib/legal.ts']

function fingerprint() {
  const hash = createHash('sha256')
  for (const file of AGREED_TEXT) hash.update(readFileSync(join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n'))
  return hash.digest('hex')
}

describe('terms version', () => {
  it('changes whenever the Terms, Privacy Policy or consent points change', () => {
    const now = { termsVersion: TERMS_VERSION, fingerprint: fingerprint() }
    if (now.fingerprint !== agreed.fingerprint) {
      expect.fail(`The Terms, Privacy Policy or consent points changed. Bump TERMS_VERSION, then set tests/terms-fingerprint.json to ${JSON.stringify({ ...now, termsVersion: '<new version>' })}`)
    }
    expect(now.termsVersion, 'TERMS_VERSION changed: update tests/terms-fingerprint.json to match').toBe(agreed.termsVersion)
  })
})

describe('asking for consent', () => {
  const now = Date.parse('2026-10-29T10:00:00Z')
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString()

  it('asks at first sign-in, after a change, and once a year', () => {
    expect(termsDue({ termsVersion: null, termsAcceptedAt: null }, TERMS_VERSION, now)).toBe('first')
    expect(termsDue({ termsVersion: 'older', termsAcceptedAt: days(1) }, TERMS_VERSION, now)).toBe('updated')
    expect(termsDue({ termsVersion: TERMS_VERSION, termsAcceptedAt: days(364) }, TERMS_VERSION, now)).toBeNull()
    expect(termsDue({ termsVersion: TERMS_VERSION, termsAcceptedAt: days(366) }, TERMS_VERSION, now)).toBe('yearly')
  })
})

describe('the Tamil consent screen and Privacy Policy', () => {
  it('has every consent point, in the same order, and every screen text', () => {
    expect(CONSENT_POINTS_TA).toHaveLength(CONSENT_POINTS.length)
    CONSENT_POINTS_TA.forEach(point => expect(point).toMatch(/[\u0B80-\u0BFF]/))
    expect(Object.keys(CONSENT_SCREEN.ta).sort()).toEqual(Object.keys(CONSENT_SCREEN.en).sort())
  })

  it('has the same sections as the English Privacy Policy', () => {
    const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')
    const count = (text: string, tag: string) => text.split(tag).length - 1
    const en = read('components/legal/PrivacyContent.tsx')
    const ta = read('components/legal/PrivacyContentTa.tsx')
    for (const tag of ['<section>', '<h2>', '<li>']) expect(count(ta, tag), tag).toBe(count(en, tag))
  })
})
