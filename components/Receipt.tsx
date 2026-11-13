'use client'

import { Button, formatInr, Sheet, useToast } from '@/components/ui'
import { useT, type Translate } from '@/lib/client/language'
import type { RechargeView } from '@/lib/client/types'
import { COMPANY } from '@/lib/legal'
import { formatMobile } from '@/lib/rules'

// The signed-in person, for "Received from".
export type ReceiptCustomer = { name: string | null; email: string | null; phone: string | null }

function formatApproved(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

type Row = { label: string; value: string }

// Everything on the receipt, once, for the screen and for printing.
function receiptContent(recharge: RechargeView, gstin: string | null, userCode: string, customer: ReceiptCustomer | undefined, t: Translate) {
  const contact = customer?.email ?? (customer?.phone ? `+91 ${formatMobile(customer.phone)}` : null)
  const from = [customer?.name, contact, t(`Customer code ${userCode}`, `வாடிக்கையாளர் குறியீடு ${userCode}`)].filter(Boolean).join('\n')
  const rows: Row[] = [
    { label: t('Receipt number', 'ரசீது எண்'), value: recharge.receiptNo ?? '' },
    { label: t('Date approved', 'அங்கீகரித்த தேதி'), value: formatApproved(recharge.approvedAt ?? recharge.createdAt) },
    { label: t('Received from', 'பெற்றது யாரிடமிருந்து'), value: from },
    {
      label: t('Description', 'விவரம்'),
      value: t(`PottuPaarkalaam credits: ${recharge.credits} credits at ₹${recharge.rateInr} each`, `PottuPaarkalaam கிரெடிட்கள்: ${recharge.credits} கிரெடிட்கள், ஒவ்வொன்றும் ₹${recharge.rateInr}`),
    },
    { label: t('Amount paid', 'செலுத்திய தொகை'), value: formatInr(recharge.amountInr) },
    { label: t('Payment', 'பணம் செலுத்திய முறை'), value: 'UPI' },
    { label: t('Reference (UTR)', 'குறிப்பு எண் (UTR)'), value: recharge.utr },
  ]
  const business = [
    `${COMPANY.name}, ${COMPANY.description}`,
    COMPANY.address,
    `${COMPANY.supportEmail} · ${COMPANY.supportPhone}`,
    gstin ? `GSTIN: ${gstin}` : t('Not registered under GST; no GST charged', 'GST-இன் கீழ் பதிவு செய்யப்படவில்லை; GST வசூலிக்கப்படவில்லை'),
  ]
  const footer = t('Credits are used only in PottuPaarkalaam. Refunds: Terms of Use §5.', 'கிரெடிட்கள் PottuPaarkalaam-இல் மட்டுமே பயன்படும். பணம் திருப்பித் தருதல்: பயன்பாட்டு விதிமுறைகள் §5.')
  return { title: t('Receipt', 'ரசீது'), rows, business, footer }
}

type Content = ReturnType<typeof receiptContent>

function receiptHtml(content: Content, lang: string) {
  const lines = (value: string) => escapeHtml(value).replace(/\n/g, '<br>')
  const rows = content.rows.map(row => `<tr><th>${lines(row.label)}</th><td>${lines(row.value)}</td></tr>`).join('')
  return `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${content.title} ${content.rows[0]?.value ?? ''}`)}</title>
<style>
@page { size: A5; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans Tamil", sans-serif; color: #000; background: #fff; font-size: 13px; line-height: 1.45; }
.receipt { max-width: 560px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 2px; }
.brand { font-weight: 800; font-size: 15px; margin: 0 0 10px; }
.business { margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid #000; }
.business p { margin: 0; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: 6px 0; border-bottom: 1px solid #ccc; }
th { width: 38%; padding-right: 10px; font-weight: 600; }
td { overflow-wrap: anywhere; }
.footer { margin-top: 14px; font-size: 11px; }
</style></head>
<body><div class="receipt">
<h1>${escapeHtml(content.title)}</h1>
<p class="brand">PottuPaarkalaam</p>
<div class="business">${content.business.map(line => `<p>${lines(line)}</p>`).join('')}</div>
<table>${rows}</table>
<p class="footer">${escapeHtml(content.footer)}</p>
</div></body></html>`
}

// The receipt for an approved recharge, with "Print / save as PDF".
export default function Receipt({ recharge, gstin, userCode, customer, onClose }: {
  recharge: RechargeView | null
  gstin: string | null
  userCode: string
  customer?: ReceiptCustomer
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const content = recharge ? receiptContent(recharge, gstin, userCode, customer, t) : null

  function print() {
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) {
      toast(t('Allow pop-ups for this site to print the receipt.', 'ரசீதை அச்சிட, இந்தத் தளத்திற்கு pop-up-களை அனுமதியுங்கள்.'), 'error')
      return
    }
    win.opener = null
    win.document.open()
    win.document.write(receiptHtml(content, t('en', 'ta')))
    win.document.close()
    win.focus()
    // Give the new page a moment to lay out before the print dialog.
    setTimeout(() => win.print(), 250)
  }

  return (
    <Sheet open={Boolean(recharge)} title={t('Receipt', 'ரசீது')} onClose={onClose}>
      {content && (
        <div className="space-y-3">
          <div className="rounded-2xl p-3 text-xs text-stone-700 ring-1 ring-stone-200">
            <p className="font-bold text-stone-900">{COMPANY.name}, {COMPANY.description}</p>
            {content.business.slice(1).map(line => <p key={line} className="break-words">{line}</p>)}
          </div>
          <dl className="divide-y divide-stone-100 text-sm">
            {content.rows.map(row => (
              <div key={row.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 py-2">
                <dt className="font-semibold text-stone-600">{row.label}</dt>
                <dd className="whitespace-pre-line font-bold [overflow-wrap:anywhere] text-stone-900">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-stone-500">{content.footer}</p>
          <Button onClick={print} className="w-full">{t('Print / save as PDF', 'அச்சிடு / PDF ஆகச் சேமி')}</Button>
        </div>
      )}
    </Sheet>
  )
}
