import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vulqan 26.111 Tracker',
  description: 'Sprints, test results and tickets for the Vulqan 26.111 release',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
