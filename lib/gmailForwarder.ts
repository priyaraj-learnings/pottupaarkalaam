// A Google Apps Script the admin runs in the Gmail account that receives the
// bank's credit alert emails (docs/SETUP.md §6.3). Every minute it sends new
// alerts to /api/payments/notify, which approves the matching recharges.
// Sending an alert twice is harmless: each UTR is recorded once.

export function gmailForwarderScript(appUrl: string) {
  return `// PottuPaarkalaam: sends your bank's credit alert emails to the app,
// so a customer's recharge is approved as soon as the money arrives.
//
// 1. Put the address your bank's alert emails come from below.
// 2. Project Settings (gear icon) > Script properties > Add:
//      PP_SECRET = your PAYMENT_WEBHOOK_SECRET (from Google Cloud Secret Manager)
// 3. Select forwardBankAlerts and press Run once; allow access to Gmail.
// 4. Triggers (clock icon) > Add trigger > forwardBankAlerts,
//      Time-driven, Minutes timer, Every minute > Save.

const BANK_EMAIL = 'alerts@hdfcbank.net'
const APP_URL = '${appUrl}'

function forwardBankAlerts() {
  const props = PropertiesService.getScriptProperties()
  const secret = props.getProperty('PP_SECRET')
  if (!secret) throw new Error('Add PP_SECRET in Project Settings > Script properties')
  const now = Math.floor(Date.now() / 1000)
  // Look back a little further than the last run, in case an email was slow.
  const since = Number(props.getProperty('PP_SINCE') || now - 3600) - 600
  const threads = GmailApp.search('from:' + BANK_EMAIL + ' after:' + since, 0, 50)
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (message.getDate().getTime() / 1000 < since) continue
      UrlFetchApp.fetch(APP_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify({ from: message.getFrom(), text: message.getPlainBody().slice(0, 5000) }),
        muteHttpExceptions: true,
      })
    }
  }
  props.setProperty('PP_SINCE', String(now))
}
`
}
