import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { TERMS_VERSION } from '@/lib/rules'

import agreed from './terms-fingerprint.json'

// Everyone is asked to agree again only when TERMS_VERSION changes, so a change
// to the words people agree to must come with a new version. If this fails:
//   1. set TERMS_VERSION in lib/rules.ts (and TERMS_EFFECTIVE in lib/legal.ts)
//      to the day of the change, then
//   2. put the new version and the fingerprint printed below in
//      tests/terms-fingerprint.json.
const AGREED_TEXT = ['components/legal/TermsContent.tsx', 'components/legal/PrivacyContent.tsx', 'lib/legal.ts']

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
