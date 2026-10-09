import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { TopNav } from './TopNav';
import { TabBar } from './TabBar';
import { isPortalPath } from './navigation';
import { useKeyboardInset } from '@/lib/keyboard';

/** The single application shell: navy band on desktop, navy tab bar on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  useKeyboardInset();
  if (isPortalPath(path)) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-amber focus:px-4 focus:py-2 focus:text-ink">Skip to content</a>
      <TopNav />
      <main id="main" className="flex-1 pb-[var(--tabbar-height)] md:pb-0">{children}</main>
      <TabBar />
    </div>
  );
}
