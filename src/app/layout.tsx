import type { Metadata, Viewport } from 'next';
import { appConfig } from '@/lib/app-config';
import { env } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: appConfig.name,
    template: `%s · ${appConfig.name}`,
  },
  description: appConfig.description,
  applicationName: appConfig.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: appConfig.name,
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
    { media: '(prefers-color-scheme: dark)', color: appConfig.themeColor },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
