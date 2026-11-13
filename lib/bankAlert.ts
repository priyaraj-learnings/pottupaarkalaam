// =======================================================
// BANK CREDIT ALERTS
//
// Reads the UPI reference (UTR / RRN, 12 digits) and the
// amount from the SMS or email a bank sends when money
// reaches inaivu IT's account, e.g.
//   "Rs.500.00 credited to HDFC Bank A/c XX1234 on 26-10-26
//    from VPA abc@okaxis (UPI 629912345678)"
//   "Dear UPI user A/C X1234 credited by Rs500.00 on date
//    26Oct26 trf from NAME Refno 629912345678 -SBI"
//   "INR 500.00 credited to A/c no. XX1234 ... Info-
//    UPI/P2A/629912345678/NAME"
// Anything that is not clearly a credit (debits, collect
// requests, "will be credited" notices) is ignored: an
// unread alert only means the admin approves by hand.
// =======================================================

export type BankCredit = {
  utr: string
  amountInr: number
}

const CREDIT = /\b(credited|received|deposited)\b/i
const DEBIT = /\b(debited|withdrawn|spent)\b/i
const WILL_BE_CREDITED = /\bwill be credited\b/i
// Collect requests and OTP messages mention these before any "credited".
const NOT_A_PAYMENT = /\b(request(?:ed)?|otp)\b/i

const AMOUNT = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi
const LABELLED_UTR = /(?:utr|rrn|ref(?:erence)?\s*(?:no|number|id)?|refno|upi(?:\/[a-z0-9]{2,4})?)(?:\s+is)?\s*[.:#/-]?\s*(?:no\.?\s*[:-]?\s*)?(\d{12})(?!\d)/i
const ANY_UTR = /(?<!\d)\d{12}(?!\d)/g

// Emails add greetings, balances, helpline numbers and safety advice ("never
// share your OTP"): only this much text around the first "credited" is read.
const BEFORE = 300
const AFTER = 400

export function parseBankCredit(text: string): BankCredit | null {
  const full = text.replace(/\s+/g, ' ').trim()
  if (!full || full.length > 20_000) return null
  const found = full.search(CREDIT)
  if (found < 0) return null
  const message = full.slice(Math.max(0, found - BEFORE), found + AFTER)
  const credit = found - Math.max(0, found - BEFORE)

  if (WILL_BE_CREDITED.test(message) || NOT_A_PAYMENT.test(message.slice(0, credit))) return null
  const debit = message.search(DEBIT)
  // "debited from X and credited to you" is someone else's alert.
  if (debit >= 0 && debit < credit) return null

  // The amount nearest "credited", not the balance further on.
  const amounts = [...message.matchAll(AMOUNT)]
    .map(match => ({ value: Number(match[1].replace(/,/g, '')), distance: Math.abs((match.index ?? 0) - credit) }))
    .sort((a, b) => a.distance - b.distance)
  const amountInr = amounts[0]?.value ?? NaN
  if (!Number.isFinite(amountInr) || amountInr <= 0) return null

  const labelled = message.match(LABELLED_UTR)?.[1]
  const all = [...new Set(message.match(ANY_UTR) ?? [])]
  const utr = labelled ?? (all.length === 1 ? all[0] : null)
  if (!utr) return null

  return { utr, amountInr }
}

// The bank's SMS sender ID from a DLT header: "VM-HDFCBK-S", "AX-HDFCBK" or
// "HDFCBK" → "HDFCBK". Phone numbers and anything else → null.
export function smsSenderId(sender: string | null | undefined) {
  const match = (sender ?? '').trim().toUpperCase().match(/^(?:[A-Z]{2}-)?([A-Z0-9]{6})(?:-[A-Z])?$/)
  return match && /[A-Z]/.test(match[1]) ? match[1] : null
}

// The address in an email From line: "HDFC Bank <alerts@hdfcbank.net>" →
// "alerts@hdfcbank.net" (the display name is ignored: anyone can set it).
export function emailAddress(sender: string | null | undefined) {
  const text = (sender ?? '').trim()
  const address = (text.match(/<([^<>\s]+@[^<>\s]+)>\s*$/)?.[1] ?? text).toLowerCase()
  return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(address) ? address : null
}

// Senders trusted to approve recharges automatically: the bank's SMS sender IDs
// ("HDFCBK") and alert email addresses ("alerts@hdfcbank.net"), comma
// separated, matched exactly. An empty list trusts nobody (alerts are then
// ignored and the admin approves recharges). An email must also have passed the
// bank's DMARC check in Gmail (emailAuthenticated, from the Gmail script).
export function senderAllowed(sender: string | null | undefined, allowList: string | null | undefined, emailAuthenticated = false) {
  const allowed = (allowList ?? '').split(',').map(item => item.trim()).filter(Boolean)
  if (!allowed.length) return false
  const address = emailAddress(sender)
  if (address) return emailAuthenticated && allowed.some(item => item.toLowerCase() === address)
  const id = smsSenderId(sender)
  return Boolean(id) && allowed.some(item => item.toUpperCase() === id)
}
