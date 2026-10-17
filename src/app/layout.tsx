import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google'
import './globals.css'

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'Vulqan 26.111 Tracker',
  description: 'Sprints, test results and tickets for the Vulqan 26.111 release',
  icons: { icon: '/vulqan-logo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  )
}
