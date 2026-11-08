import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';

const links = [
  { to: '/experiments', label: '实验目录' },
  { to: '/about', label: '平台与方法' },
  { to: '/researcher/login', label: '研究者入口' },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className={cn('site-header', scrolled && 'is-scrolled')}>
      <div className="header-inner">
        <Logo />
        <nav className={cn('site-nav', menuOpen && 'is-open')} aria-label="主导航">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'nav-link',
                  isActive &&
                    (link.to === '/experiments'
                      ? 'nav-link--active'
                      : location.pathname === link.to
                        ? 'nav-link--active'
                        : ''),
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <Link to="/enter" className="btn btn--primary btn--sm">
            开始实验
            <ArrowUpRight size={14} strokeWidth={1.7} />
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? '关闭导航' : '打开导航'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
