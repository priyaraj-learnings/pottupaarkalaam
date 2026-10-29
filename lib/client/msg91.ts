'use client'

// MSG91's OTP widget (the admin's, set in /admin Settings): its own window asks
// for the mobile number, sends the code and checks it, then hands back an
// access token that the server confirms with MSG91 (lib/server/phoneLogin.ts).

declare global {
  interface Window {
    initSendOTP?: (configuration: Record<string, unknown>) => void
  }
}

const WIDGET_SCRIPT = 'https://verify.msg91.com/otp-provider.js'

let loading: Promise<void> | null = null

function loadWidget() {
  if (window.initSendOTP) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = WIDGET_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('The SMS service could not be reached. Check your internet and try again.'))
    }
    document.head.appendChild(script)
  })
  return loading
}

// Opens the widget. onToken runs once the person has entered the right code;
// nothing runs if they close the window.
// identifier: a number to fill in, as 91 and 10 digits.
export async function openMsg91Widget(
  config: { widgetId: string; tokenAuth: string; identifier?: string },
  onToken: (accessToken: string) => void,
  onError: (message: string) => void,
) {
  await loadWidget()
  if (!window.initSendOTP) throw new Error('The SMS service could not be reached. Please try again.')
  window.initSendOTP({
    widgetId: config.widgetId,
    tokenAuth: config.tokenAuth,
    ...(config.identifier ? { identifier: config.identifier } : {}),
    // Both callbacks are needed: the widget fails without them.
    success: (data: unknown) => {
      const token = typeof data === 'string' ? data : (data as { message?: unknown } | null)?.message
      if (typeof token === 'string' && token.length > 20) {
        onToken(token)
      } else {
        console.warn('MSG91 widget success without a token', data)
        onError(`MSG91 did not send back a sign-in token${widgetReason(data)}. Please try again.`)
      }
    },
    failure: (error: unknown) => {
      console.warn('MSG91 widget failure', error)
      onError(`The code could not be confirmed${widgetReason(error)}. Please try again.`)
    },
  })
}

// MSG91's own words, when it gives any: " (MSG91: Invalid OTP)".
function widgetReason(value: unknown) {
  const text = typeof value === 'string' ? value
    : (value as { message?: unknown; error?: unknown } | null)?.message ?? (value as { error?: unknown } | null)?.error
  return typeof text === 'string' && text.trim() && text.length < 160 ? ` (MSG91: ${text.trim()})` : ''
}
