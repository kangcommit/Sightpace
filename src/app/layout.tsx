import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
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
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#15211c' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider delay={500}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
