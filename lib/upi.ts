// UPI payment link with the amount filled in (the same as KanakkuPaar's). On a
// phone it opens the UPI app chooser; as a QR it can be scanned by any UPI app.
// The note carries the customer's code so a payment can be matched by hand.
export function upiLink(input: { upiId: string; payeeName: string | null; amountInr: number; note: string }) {
  const query = new URLSearchParams({ pa: input.upiId, am: input.amountInr.toFixed(2), cu: 'INR', tn: input.note.slice(0, 50) })
  if (input.payeeName) query.set('pn', input.payeeName)
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
