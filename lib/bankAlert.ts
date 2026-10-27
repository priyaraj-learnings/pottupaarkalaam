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
const NOT_A_PAYMENT = /\b(request(?:ed)?|will be credited|otp)\b/i

const AMOUNT = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
const LABELLED_UTR = /(?:utr|rrn|ref(?:erence)?\s*(?:no|number|id)?|refno|upi(?:\/[a-z0-9]{2,4})?)\s*[.:#/-]?\s*(?:no\.?\s*[:-]?\s*)?(\d{12})(?!\d)/i
const ANY_UTR = /(?<!\d)\d{12}(?!\d)/g

export function parseBankCredit(text: string): BankCredit | null {
  const message = text.replace(/\s+/g, ' ').trim()
  if (!message || message.length > 2000) return null
  if (NOT_A_PAYMENT.test(message)) return null

  const credit = message.search(CREDIT)
  if (credit < 0) return null
  const debit = message.search(DEBIT)
  // "debited from X and credited to you" is someone else's alert.
  if (debit >= 0 && debit < credit) return null

  const amountMatch = message.match(AMOUNT)
  const amountInr = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN
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
