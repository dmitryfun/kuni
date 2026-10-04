import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://kuniman.me'),
  title: 'kuniman.me — привет, это я',
  description: 'Личный уголок интернета. Просто kuniman, немного в движении.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'kuniman.me — привет, это я',
    description: 'Один человек. Свой вайб. Мой маленький уголок интернета.',
    url: 'https://kuniman.me',
    siteName: 'kuniman.me',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: '/rig/posed-preview.png', width: 760, height: 1000, alt: 'kuniman' }],
  },
  icons: { icon: '/kuniman-icon.svg' },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#171719',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
