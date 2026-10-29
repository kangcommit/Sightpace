import type { Metadata, Viewport } from 'next'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_NAME } from '@/lib/brand'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Travel day planner`,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Plan stops in order, add travel estimates, and see how fixed bookings fit.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f7f2',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider delay={500}>{children}</TooltipProvider>
      </body>
    </html>
  )
}
