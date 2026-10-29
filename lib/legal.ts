// Who runs PottuPaarkalaam (the same firm and officers as UduthiPaar,
// garment-ai-saas lib/legal/legal.ts). Shown on /terms and /privacy.

export const TERMS_EFFECTIVE = '29 October 2026'

export const COMPANY = {
  name: 'inaivu IT',
  description: 'a partnership firm',
  address: '101 Periyakollappatti - Block 5, Periyakollappatti, Salem District, Tamil Nadu 636 808, India',
  supportEmail: 'partnerships@inaivuit.com',
  // Customer care (Consumer Protection (E-Commerce) Rules 2020, rule 4(2)).
  supportPhone: '+91 96777 57237',
  supportPhoneLink: 'tel:+919677757237',
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

// The consent screen in Tamil (DPDP Act 2023, section 5(3)). The same points,
// in the same order, as CONSENT_POINTS.
export const CONSENT_POINTS_TA = [
  'எனக்கு 18 வயது அல்லது அதற்கு மேல் ஆகிறது.',
  'நான் சேர்க்கும் புகைப்படங்கள் என்னுடையவை, அல்லது அந்த நபரின் அனுமதி பெற்றவை.',
  'என் புகைப்படங்களும் படங்களும் 3 நாட்களில் நீக்கப்படும். வைத்துக்கொள்ள விரும்புபவற்றை நானே சேமித்துக்கொள்வேன்.',
  'படங்கள் AI மூலம் ஒரு முன்னோட்டமாக உருவாக்கப்படுகின்றன. உண்மையான உடை வேறுபட்டுத் தோன்றலாம்.',
  'ஒவ்வொரு படத்திலும் "AI-generated" என்ற குறி இருக்கும். அந்தக் குறியை நான் நீக்கமாட்டேன்; படத்தை உண்மையான புகைப்படம் என்று காட்டமாட்டேன்.',
  'நான் சேமிக்கும் அல்லது பகிரும் படங்கள், செயலியை விட்டு வெளியே சென்ற பிறகு என் பொறுப்பு.',
  'பயன்படுத்திய கிரெடிட்கள் திருப்பித் தரப்படாது. படம் உருவாகவில்லை என்றால், அதன் கிரெடிட்கள் தானாகவே திரும்பி வரும்.',
]

export type Language = 'en' | 'ta'

export const CONSENT_SCREEN: Record<Language, {
  title: string
  updated: string
  yearly: string
  agreeBefore: string
  terms: string
  and: string
  privacy: string
  agreeAfter: string
  agree: string
  tickFirst: string
  signOut: string
  termsEnglishOnly: string
  points: string[]
}> = {
  en: {
    title: 'Before you start',
    updated: 'We have updated our Terms and Privacy Policy. Please read them and agree again.',
    yearly: 'Once a year we ask everyone to read our Terms and Privacy Policy again. Nothing has changed for you.',
    agreeBefore: 'I have read and agree to the',
    terms: 'Terms of Use',
    and: 'and',
    privacy: 'Privacy Policy',
    agreeAfter: '.',
    agree: 'I agree',
    tickFirst: 'Tick the box above to continue.',
    signOut: 'Sign out',
    termsEnglishOnly: '',
    points: CONSENT_POINTS,
  },
  ta: {
    title: 'தொடங்கும் முன்',
    updated: 'எங்கள் பயன்பாட்டு விதிமுறைகளையும் தனியுரிமைக் கொள்கையையும் புதுப்பித்துள்ளோம். தயவுசெய்து படித்து மீண்டும் ஒப்புக்கொள்ளுங்கள்.',
    yearly: 'ஆண்டுக்கு ஒருமுறை, எங்கள் விதிமுறைகளையும் தனியுரிமைக் கொள்கையையும் மீண்டும் படிக்கும்படி அனைவரையும் கேட்கிறோம். உங்களுக்கு எதுவும் மாறவில்லை.',
    agreeBefore: 'நான்',
    terms: 'பயன்பாட்டு விதிமுறைகள்',
    and: 'மற்றும்',
    privacy: 'தனியுரிமைக் கொள்கை',
    agreeAfter: 'ஆகியவற்றைப் படித்து ஒப்புக்கொள்கிறேன்.',
    agree: 'ஒப்புக்கொள்கிறேன்',
    tickFirst: 'தொடர, மேலே உள்ள பெட்டியைத் தேர்ந்தெடுக்கவும்.',
    signOut: 'வெளியேறு',
    termsEnglishOnly: 'பயன்பாட்டு விதிமுறைகள் தற்போது ஆங்கிலத்தில் மட்டுமே உள்ளன.',
    points: CONSENT_POINTS_TA,
  },
}
