import type { Metadata, Viewport } from 'next';
import { appConfig } from '@/lib/app-config';
import { env } from '@/lib/env';
// Self-hosted variable fonts. Shipped with the app rather than fetched from a
// font CDN at runtime: a PWA should not need a third-party request to render
// its own text, and it keeps the build working offline and behind a proxy.
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/inter/wght.css';
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
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
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
