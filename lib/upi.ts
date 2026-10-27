// UPI payment link with the amount filled in (the same as KanakkuPaar's). On a
// phone it opens the UPI app chooser; as a QR it can be scanned by any UPI app.
// The note carries the customer's code so a payment can be matched by hand.
export function upiLink(input: { upiId: string; payeeName: string | null; amountInr: number; note: string }) {
  const query = new URLSearchParams({ pa: input.upiId, am: input.amountInr.toFixed(2), cu: 'INR', tn: input.note.slice(0, 50) })
  if (input.payeeName) query.set('pn', input.payeeName)
  return `upi://pay?${query.toString().replace(/\+/g, '%20')}`
}

// A short code for a person, shown on their recharge screen and in /admin.
export function customerCode(userId: string) {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase()
}
