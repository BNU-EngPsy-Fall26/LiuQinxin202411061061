import { Outlet } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { DreamBackground } from './DreamBackground';
import { ToastProvider } from '@/components/ui/Toast';

export function SiteLayout({ quiet = false }: { quiet?: boolean }) {
  return (
    <ToastProvider>
      <div className="page">
        <DreamBackground quiet={quiet} />
        <SiteHeader />
        <main className="page-content">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}
