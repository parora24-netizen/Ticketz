function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return value
}

/** Safe to use anywhere, including the browser. Read directly so Next.js can inline them. */
export const publicEnv = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
}

/** Server only. */
export function serverEnv() {
  return {
    secretKey: required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY),
    allowedDomains: (process.env.ALLOWED_EMAIL_DOMAINS ?? 'vulqan.ai,mezocliq.com')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  }
}
