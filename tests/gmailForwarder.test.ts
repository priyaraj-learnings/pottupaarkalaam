import { describe, expect, it } from 'vitest'

import { gmailForwarderScript } from '@/lib/gmailForwarder'

// Runs the Apps Script against a pretend Gmail, as Google would every minute.
describe('Gmail forwarder script', () => {
  it('sends new bank emails to the app with the secret, and remembers where it got to', () => {
    const store: Record<string, string> = { PP_SECRET: 's3cret' }
    const properties = { getProperty: (key: string) => store[key] ?? null, setProperty: (key: string, value: string) => { store[key] = value } }
    const now = Date.now()
    const message = (ageSeconds: number, body: string, from = 'HDFC Bank InstaAlerts <alerts@hdfcbank.net>', dmarc = 'pass') => ({
      getDate: () => new Date(now - ageSeconds * 1000),
      getFrom: () => from,
      getHeader: (name: string) => (name === 'Authentication-Results' ? `mx.google.com; dkim=pass; spf=pass; dmarc=${dmarc} (p=REJECT)` : ''),
      getPlainBody: () => body,
    })
    const searches: string[] = []
    const sent: Array<{ url: string; options: { headers: Record<string, string>; payload: string } }> = []

    const run = new Function('PropertiesService', 'GmailApp', 'UrlFetchApp', `${gmailForwarderScript('https://pp.example/api/payments/notify')}\nforwardBankAlerts()`)
    run(
      { getScriptProperties: () => properties },
      { search: (query: string) => { searches.push(query); return [{ getMessages: () => [
        message(30, 'Rs.100.00 credited'), message(3 * 3600, 'old'),
        // Fakes: the bank's address only in the name, or failing the bank's DMARC check.
        message(20, 'fake 1', '"alerts@hdfcbank.net" <attacker@example.com>'), message(20, 'fake 2', 'alerts@hdfcbank.net', 'fail'),
      ] }] } },
      { fetch: (url: string, options: { headers: Record<string, string>; payload: string }) => { sent.push({ url, options }) } },
    )

    expect(searches[0]).toMatch(/^from:alerts@hdfcbank\.net after:\d+$/)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://pp.example/api/payments/notify')
    expect(sent[0].options.headers.Authorization).toBe('Bearer s3cret')
    expect(JSON.parse(sent[0].options.payload)).toEqual({ from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.net>', authenticated: true, text: 'Rs.100.00 credited' })
    expect(Number(store.PP_SINCE)).toBeGreaterThan(now / 1000 - 5)
  })

  it('stops with a clear message when the secret is missing', () => {
    const run = new Function('PropertiesService', 'GmailApp', 'UrlFetchApp', `${gmailForwarderScript('https://pp.example')}\nforwardBankAlerts()`)
    expect(() => run({ getScriptProperties: () => ({ getProperty: () => null }) }, {}, {})).toThrow(/PP_SECRET/)
  })
})
