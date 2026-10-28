import type { GarmentSource, PairRole, Pricing } from '@/lib/rules'

// What the API returns (lib/server/*), for the screens.

export type Account = {
  credits: number
  freeCreditsPerMonth: number
  freeLeft: number
  termsVersion: string | null
  termsAcceptedAt: string | null
  phone: string | null
  offersOk: boolean
  phoneAskedAt: string | null
}

export type AppSettings = {
  upiId: string | null
  payeeName: string | null
  supportContact: string | null
  pricing: Pricing
}

export type Me = {
  user: { email: string | null; name: string | null }
  account: Account
  settings: AppSettings
  isAdmin: boolean
}

export type LookStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export type LookView = {
  id: string
  kind: 'SINGLE' | 'PAIR'
  credits: number
  status: LookStatus
  garments: Array<{ category: string; source: GarmentSource; role: 'MAIN' | PairRole }>
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
