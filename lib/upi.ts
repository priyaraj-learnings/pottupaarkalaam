// The business's own UPI QR text, read: its UPI ID and the merchant details
// it carries (mc = merchant category, aid / tr = Google Pay merchant account
// and QR reference, ver, mode…). null if it is not a UPI payment QR.
export function parseUpiQr(text: string | null | undefined) {
  const trimmed = text?.trim() ?? ''
  if (!/^upi:\/\/pay\?/i.test(trimmed)) return null
  const params = new URLSearchParams(trimmed.slice(trimmed.indexOf('?') + 1))
  const pa = params.get('pa')
  return pa ? { pa, payeeName: params.get('pn'), merchantCode: params.get('mc'), params } : null
}

// Set by the app for each payment; everything else comes from the QR.
const PER_PAYMENT = ['pa', 'am', 'cu', 'tn', 'sign']

// UPI payment link with the amount filled in (the same as KanakkuPaar's). On a
// phone it opens the UPI app chooser; as a QR it can be scanned by any UPI app.
// The note carries the customer's code so a payment can be matched by hand.
// With the business's own QR text (for the same UPI ID), the link keeps its
// merchant details, so UPI apps treat it like a scan of that QR. A signed QR's
// signature is left out: it would not match the added amount.
export function upiLink(input: { upiId: string; payeeName: string | null; amountInr: number; note: string; qrText?: string | null }) {
  const query = new URLSearchParams({ pa: input.upiId })
  const qr = parseUpiQr(input.qrText)
  if (qr && qr.pa.toLowerCase() === input.upiId.toLowerCase()) {
    for (const [key, value] of qr.params) if (!PER_PAYMENT.includes(key)) query.set(key, value)
  }
  if (input.payeeName && !query.has('pn')) query.set('pn', input.payeeName)
  query.set('am', input.amountInr.toFixed(2))
  query.set('cu', 'INR')
  query.set('tn', input.note.slice(0, 50))
  return `upi://pay?${query.toString().replace(/\+/g, '%20')}`
}

export type PhoneKind = 'android' | 'ios' | 'other'

export function phoneKind(userAgent: string): PhoneKind {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  return 'other'
}

// Buttons that open one UPI app with the payee and amount filled in, for
// paying from the phone the app is on (a QR on your own screen cannot be
// scanned). Android's plain upi:// link opens a chooser of every UPI app;
// iPhones need each app's own link. If an app is not installed, nothing opens
// and the customer picks another.
export function upiAppLinks(link: string, phone: PhoneKind) {
  const query = link.slice(link.indexOf('?'))
  return [
    { app: 'Google Pay', href: phone === 'ios' ? `gpay://upi/pay${query}` : `tez://upi/pay${query}` },
    { app: 'PhonePe', href: `phonepe://pay${query}` },
    { app: 'Paytm', href: `paytmmp://pay${query}` },
    { app: phone === 'android' ? 'Other UPI app (BHIM, bank apps…)' : 'Other UPI app', href: link },
  ]
}

// A short code for a person, shown on their recharge screen and in /admin.
export function customerCode(userId: string) {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase()
}
