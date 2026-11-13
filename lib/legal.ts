// Who runs PottuPaarkalaam (the same firm and officers as UduthiPaar,
// garment-ai-saas lib/legal/legal.ts). Shown on /terms and /privacy.

export const TERMS_EFFECTIVE = '13 November 2026'

export const COMPANY = {
  name: 'inaivu IT',
  description: 'a partnership firm',
  address: '101 Periyakollappatti - Block 5, Periyakollappatti, Salem District, Tamil Nadu 636 808, India',
  supportEmail: 'pottupaar@inaivuit.com',
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
  'My photos are sent to OpenAI (USA) to make my pictures.',
  'My photos and pictures are deleted from PottuPaarkalaam after 3 days (OpenAI may keep a copy up to 30 days, only to check for misuse). I will save the ones I want to keep.',
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
  'என் படங்களை உருவாக்க, என் புகைப்படங்கள் OpenAI (அமெரிக்கா) நிறுவனத்துக்கு அனுப்பப்படும்.',
  'என் புகைப்படங்களும் படங்களும் 3 நாட்களில் PottuPaarkalaam-இலிருந்து நீக்கப்படும் (தவறான பயன்பாட்டைக் கண்டறிய மட்டும் OpenAI 30 நாட்கள் வரை ஒரு நகலை வைத்திருக்கலாம்). வைத்துக்கொள்ள விரும்புபவற்றை நானே சேமித்துக்கொள்வேன்.',
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
  // The itemised notice (DPDP Rules 2025, rule 3): each kind of data, why, and
  // how long it is kept, with its own tick.
  dataTitle: string
  dataItems: Array<{ what: string; why: string }>
  dataRights: string
  dataAgree: string
  tickBoth: string
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
    dataTitle: 'How we use your personal data',
    dataItems: [
      { what: 'Photos of you (and your partner, for a couple picture) and of the clothes', why: 'To make your pictures. Sent to OpenAI (USA) for that. Deleted from our servers after 3 days; OpenAI may keep a copy up to 30 days, only to check for misuse.' },
      { what: 'Your name and email, or your mobile number', why: 'Your account and sign-in. Kept while your account is open; after you delete it, the sign-in details are kept 180 days, as Indian law requires, then deleted.' },
      { what: 'Your verified mobile number', why: 'Monthly free credits, one set per number. MSG91 (India) sends the SMS code.' },
      { what: 'Payments: amount, date, UPI reference and the bank\'s message', why: 'To add your credits and give you a receipt. Kept as tax law requires (usually 8 years).' },
      { what: 'A record of what you did and when, and your internet address (no photos)', why: 'Security, complaints and the law. Kept 1 year.' },
      { what: 'Only if you choose: offers on WhatsApp, SMS or email, notifications, invites', why: 'As you set them in the account menu. You can stop them any time.' },
    ],
    dataRights: 'Withdraw your consent any time: Delete my account (account menu), or write to {privacyEmail}. Complaints: the Complaints page or our Grievance Officer, then the Data Protection Board of India.',
    dataAgree: 'I agree to my personal data being used as described above.',
    tickBoth: 'Tick both boxes to continue.',
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
    termsEnglishOnly: '',
    points: CONSENT_POINTS_TA,
    dataTitle: 'உங்கள் தனிப்பட்ட தரவை எப்படிப் பயன்படுத்துகிறோம்',
    dataItems: [
      { what: 'உங்கள் புகைப்படங்கள் (ஜோடிப் படத்துக்கு உங்கள் துணையினுடையதும்), உடைகளின் புகைப்படங்கள்', why: 'உங்கள் படங்களை உருவாக்க. அதற்காக OpenAI (அமெரிக்கா) நிறுவனத்துக்கு அனுப்பப்படும். 3 நாட்களில் எங்கள் சர்வர்களிலிருந்து நீக்கப்படும்; தவறான பயன்பாட்டைக் கண்டறிய மட்டும் OpenAI 30 நாட்கள் வரை ஒரு நகலை வைத்திருக்கலாம்.' },
      { what: 'உங்கள் பெயர், மின்னஞ்சல் அல்லது மொபைல் எண்', why: 'உங்கள் கணக்கும் உள்நுழைவும். கணக்கு இருக்கும் வரை வைக்கப்படும்; நீங்கள் கணக்கை நீக்கிய பின், இந்தியச் சட்டப்படி உள்நுழைவு விவரங்கள் 180 நாட்கள் வைக்கப்பட்டுப் பிறகு நீக்கப்படும்.' },
      { what: 'உங்கள் சரிபார்த்த மொபைல் எண்', why: 'மாதாந்திர இலவச கிரெடிட்கள், ஒரு எண்ணுக்கு ஒரு முறை. SMS குறியீட்டை MSG91 (இந்தியா) அனுப்புகிறது.' },
      { what: 'பணம் செலுத்திய விவரங்கள்: தொகை, தேதி, UPI குறிப்பு எண், வங்கியின் செய்தி', why: 'உங்கள் கிரெடிட்களைச் சேர்க்கவும் ரசீது தரவும். வரிச் சட்டம் கோரும் காலம் வரை (பொதுவாக 8 ஆண்டுகள்) வைக்கப்படும்.' },
      { what: 'நீங்கள் என்ன செய்தீர்கள், எப்போது, உங்கள் இணைய முகவரி ஆகியவற்றின் பதிவு (புகைப்படங்கள் இல்லை)', why: 'பாதுகாப்பு, புகார்கள், சட்டம். 1 ஆண்டு வைக்கப்படும்.' },
      { what: 'நீங்கள் தேர்ந்தெடுத்தால் மட்டும்: WhatsApp, SMS அல்லது மின்னஞ்சலில் சலுகைகள், அறிவிப்புகள், அழைப்புகள்', why: 'கணக்கு மெனுவில் நீங்கள் அமைத்தபடி. எப்போது வேண்டுமானாலும் நிறுத்தலாம்.' },
    ],
    dataRights: 'உங்கள் ஒப்புதலை எப்போது வேண்டுமானாலும் திரும்பப் பெறலாம்: Delete my account (கணக்கு மெனு), அல்லது {privacyEmail}-க்கு எழுதுங்கள். புகார்கள்: புகார்கள் பக்கம் அல்லது எங்கள் குறைதீர்ப்பு அலுவலர், பிறகு இந்தியத் தரவுப் பாதுகாப்பு வாரியம்.',
    dataAgree: 'மேலே சொன்னபடி என் தனிப்பட்ட தரவு பயன்படுத்தப்பட ஒப்புக்கொள்கிறேன்.',
    tickBoth: 'தொடர, இரண்டு பெட்டிகளையும் தேர்ந்தெடுக்கவும்.',
  },
}
