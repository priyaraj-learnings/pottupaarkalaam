import type { CoupleRole, GarmentSource, LookKind, PairRole, Pricing } from '@/lib/rules'

// What the API returns (lib/server/*), for the screens.

export type Account = {
  credits: number
  freeCreditsPerMonth: number
  freeLeft: number
  termsVersion: string | null
  termsAcceptedAt: string | null
  phone: string | null
  // Verified with an SMS code (MSG91); one account per verified number.
  phoneVerified: boolean
  offersOk: boolean
  phoneAskedAt: string | null
  // Chose to show couple pictures (when the admin has them on).
  coupleOptIn: boolean
}

export type AppSettings = {
  upiId: string | null
  // The business's own UPI QR text: its merchant details go into the pay links.
  upiQrText: string | null
  payeeName: string | null
  supportContact: string | null
  pricing: Pricing
  // Free credits only with a verified mobile number: the app asks for one.
  mobileRequired: boolean
  // The MSG91 OTP widget's public values, when verification is set up.
  phoneWidget: { widgetId: string; tokenAuth: string } | null
  // Couple pictures: on for the app, and their price in paid credits.
  couple: { enabled: boolean; credits: number }
}

export type Me = {
  // phone: set for a mobile number sign-in (email is then null).
  user: { email: string | null; name: string | null; phone: string | null }
  account: Account
  settings: AppSettings
  isAdmin: boolean
  // The server's TERMS_VERSION: a page loaded before an update still asks.
  currentTermsVersion: string
}

export type LookStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export type LookView = {
  id: string
  kind: LookKind
  credits: number
  status: LookStatus
  garments: Array<{ category: string; source: GarmentSource; role: 'MAIN' | PairRole | CoupleRole }>
  imageUrl: string | null
  error: string | null
  refunded: boolean
  createdAt: string
  expiresAt: string
}

export type RechargeView = {
  id: string
  amountInr: number
  credits: number
  rateInr: number
  utr: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  autoVerified: boolean
  rejectionReason: string | null
  createdAt: string
}

export const isFinished = (look: Pick<LookView, 'status'>) => look.status === 'COMPLETED' || look.status === 'FAILED'
