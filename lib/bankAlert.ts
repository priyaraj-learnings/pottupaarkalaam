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

// Sender IDs allowed to report credits (e.g. "HDFCBK,ICICIT,SBIUPI"), matched
// inside DLT headers such as "VM-HDFCBK-S". Empty list: any sender.
export function senderAllowed(sender: string | null | undefined, allowList: string | null | undefined) {
  const allowed = (allowList ?? '').split(',').map(item => item.trim().toUpperCase()).filter(Boolean)
  if (!allowed.length) return true
  const from = (sender ?? '').toUpperCase()
  return allowed.some(id => from.includes(id))
}
