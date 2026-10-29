// Who runs PottuPaarkalaam (the same firm and officers as UduthiPaar,
// garment-ai-saas lib/legal/legal.ts). Shown on /terms and /privacy.

export const TERMS_EFFECTIVE = '29 October 2026'

export const COMPANY = {
  name: 'inaivu IT',
  description: 'a partnership firm',
  address: '101 Periyakollappatti - Block 5, Periyakollappatti, Salem District, Tamil Nadu 636 808, India',
  supportEmail: 'partnerships@inaivuit.com',
  privacyEmail: 'privacy@inaivuit.com',
  grievanceOfficer: 'Priyaraja Asokan',
  grievanceEmail: 'grievance@inaivuit.com',
  jurisdiction: 'Salem, Tamil Nadu',
}

// The promises on the consent screen. Like the Terms and Privacy text, changing
// them means bumping TERMS_VERSION (tests/terms.test.ts checks).
export const CONSENT_POINTS = [
  'I am 18 or older.',
  'The photos I add are of me, or I have that person\'s permission.',
  'My photos and pictures are deleted after 3 days. I will save the ones I want to keep.',
  'Pictures are made by AI as a preview. Real clothes may look different.',
  'Every picture is labelled "AI-generated". I will not remove the label or pass a picture off as a real photo.',
  'Pictures I save or share are my responsibility once they leave the app.',
  'Used credits are not refunded. If a picture fails, its credits come back automatically.',
]
