'use client'

import { createClient } from '@supabase/supabase-js'

// Sign-in only: the browser never reads or writes the database directly
// (every table is server-only). The session stays on the phone, so people
// sign in once and stay signed in, like any other app.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)
