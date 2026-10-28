import { describe, expect, it } from 'vitest'

import { parseBankCredit, senderAllowed } from '@/lib/bankAlert'

describe('bank credit alerts', () => {
  it('reads common Indian bank credit SMS formats', () => {
    const cases: Array<[string, string, number]> = [
      ['Money Received - INR 500.00 in your HDFC Bank A/c xx1234 on 26-10-26 from VPA abc@okaxis (UPI Ref No 629912345678)', '629912345678', 500],
      ['Rs.1,000.00 credited to HDFC Bank A/c XX1234 on 26-10-26 from VPA xyz@ybl (UPI 629912345679)', '629912345679', 1000],
      ['Dear UPI user A/C X1234 credited by Rs500.00 on date 26Oct26 trf from RAVI K Refno 629912345680. If not u? call 1800111109. -SBI', '629912345680', 500],
      ['ICICI Bank Acct XX123 credited with Rs 200.00 on 26-Oct-26 from abc@okicici. UPI:629912345681 - ICICI Bank.', '629912345681', 200],
      ['INR 2,000.00 credited to A/c no. XX1234 on 26-10-26 at 10:12:13 IST. Info- UPI/P2A/629912345682/PRIYA/HDFC Bank. Not you? SMS BLOCKUPI to 919951860002', '629912345682', 2000],
      ['Received Rs.150.00 in your Kotak Bank a/c X1234 from abc@okhdfcbank on 26-10-26.UPI Ref:629912345683.', '629912345683', 150],
      ['₹ 100 received from Meena via UPI. UTR: 629912345684', '629912345684', 100],
    ]
    for (const [text, utr, amountInr] of cases) {
      expect(parseBankCredit(text), text).toEqual({ utr, amountInr })
    }
  })

  it('reads bank alert emails, with their greetings, balances and safety advice', () => {
    const footer = ' Never share your Card number, CVV, PIN, OTP, Internet Banking User ID or password with anyone, even if the'
      + ' request appears to be from the bank. For any query call 1800 202 6161 or 1860 267 6161. Warm Regards, the Bank.'
      + ' This is a system-generated email. '.repeat(20)
    const cases: Array<[string, string, number]> = [
      ['Dear Customer, Rs.100.00 has been credited to your account **1234 by VPA prworkshop@okaxis PRAVEENA on 28-10-26.'
        + ' Your UPI transaction reference number is 630212345678. Thank you for banking with us.' + footer, '630212345678', 100],
      ['Dear Customer, Your ICICI Bank Account XX123 has been credited with INR 100.00 on 28-Oct-26. Info:UPI/630212345679/MEENA.'
        + ' The Available Balance in your Account is INR 5,000.00.' + footer, '630212345679', 100],
      ['Dear Customer, your A/c X1234 has been credited by Rs.250.00 on 28-10-26 by transfer from MEENA (UPI Ref No 630212345680).'
        + footer, '630212345680', 250],
    ]
    for (const [text, utr, amountInr] of cases) {
      expect(parseBankCredit(text), text.slice(0, 80)).toEqual({ utr, amountInr })
    }
  })

  it('ignores debits, collect requests and messages without a UTR', () => {
    expect(parseBankCredit('Rs.500.00 debited from A/c XX1234 to VPA a@ybl UPI Ref 629912345678')).toBeNull()
    expect(parseBankCredit('abc@ybl has requested money Rs 500 from you. UPI Ref 629912345678')).toBeNull()
    expect(parseBankCredit('Your refund of Rs 500 will be credited in 3 days. Ref 629912345678')).toBeNull()
    expect(parseBankCredit('Rs 500 credited to your account')).toBeNull()
    expect(parseBankCredit('Rs 500 credited. Ref 629912345678 and 629912345679 balance')).toEqual({ utr: '629912345678', amountInr: 500 })
    expect(parseBankCredit('Credited: 629912345678 and 629912345679 Rs 500')).toBeNull()
    expect(parseBankCredit('Your OTP is 123456. Rs 500 credited 629912345678')).toBeNull()
    expect(parseBankCredit('')).toBeNull()
  })

  it('checks the sender against the allowed bank IDs', () => {
    expect(senderAllowed('VM-HDFCBK-S', 'HDFCBK, ICICIT')).toBe(true)
    expect(senderAllowed('+919876543210', 'HDFCBK')).toBe(false)
    expect(senderAllowed('+919876543210', '')).toBe(true)
    expect(senderAllowed(null, 'HDFCBK')).toBe(false)
  })
})
