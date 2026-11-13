import type { CoupleRole, GarmentSource, LookKind, PairRole, Pricing, StarterPack } from '@/lib/rules'

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
  // A recharge approved this month: may add a 4th and 5th photo to a try.
  paidThisMonth: boolean
  // "Send me offers and news by email".
  emailOffersOk: boolean
  // The monthly "your free pictures are back" email.
  monthlyEmailOk: boolean
  // Refer a friend: invite link pp.inaivuit.com/?ref=<referralCode>.
  referralCode: string
  referralCredits: number
  friendsJoined: number
  // The starter pack is still open to this account (no recharge yet).
  starterAvailable: boolean
  // Finished pictures made so far (for the "Rate us" card).
  completedPictures: number
  // Blocked by the admin for breaking the Terms (cannot make pictures or pay).
  blocked: boolean
  blockedReason: string | null
  // When the itemised "how my data is used" notice was agreed to (null: ask).
  dataConsentAt: string | null
}

export type AppSettings = {
  upiId: string | null
  // The business's own UPI QR text: its merchant details go into the pay links.
  upiQrText: string | null
  // Phones show "pay with <app>" link buttons; off: save the QR and scan it.
  upiAppButtons: boolean
  payeeName: string | null
  supportContact: string | null
  pricing: Pricing
  // The MSG91 OTP widget's public values, when verification is set up. Free
  // credits only with a verified mobile number: the app asks for one.
  phoneWidget: { widgetId: string; tokenAuth: string } | null
  // Couple pictures: on for the app, and their price in paid credits.
  couple: { enabled: boolean; credits: number }
  // Extra (4th and 5th) photos for paying customers, and their extra credits.
  extraPhotos: { enabled: boolean; credits: number }
  // Refer a friend: credits each side gets (0: off), up to this many friends.
  referralCredits: number
  referralMaxPerPerson: number
  // The starter pack (first recharge only), or null when off.
  starterPack: StarterPack | null
  // "Rate us on Google" link, or null.
  googleReviewUrl: string | null
  // On receipts, once registered for GST.
  gstin: string | null
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
  // "Report a problem" (finished, within its 3 days, not reported yet).
  canReport?: boolean
  problemStatus?: 'OPEN' | 'REFUNDED' | 'DECLINED' | null
  problemReply?: string | null
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
  // Approved recharges: the receipt number and when it was approved.
  receiptNo: string | null
  approvedAt: string | null
}

export const isFinished = (look: Pick<LookView, 'status'>) => look.status === 'COMPLETED' || look.status === 'FAILED'
