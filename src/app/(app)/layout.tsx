import { AppHeader } from '@/components/nav/app-header';
import { BottomNav } from '@/components/nav/bottom-nav';
import { OfflineBanner } from '@/components/offline-banner';
import { ToastProvider } from '@/components/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-dvh md:pl-56">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-40 focus:rounded-md focus:border focus:border-line-strong focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <OfflineBanner />
        <AppHeader />
        <main id="main" className="px-safe mx-auto max-w-md pt-5 pb-28 md:max-w-2xl md:pb-12">
          {children}
        </main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
