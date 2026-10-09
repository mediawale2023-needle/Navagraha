import { Link, useLocation, useSearch } from 'wouter';
import { PRIMARY_NAV, activeNav } from './navigation';
import { AccountPill } from './AccountMenu';

/** Direction 3 desktop navigation: the navy band across the top of every page. */
export function TopNav() {
  const [path] = useLocation();
  const active = activeNav(path, useSearch());
  return (
    <div className="hidden bg-ink md:block" data-testid="top-nav">
      <nav aria-label="Primary" className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-8 px-10 py-[18px]">
        <Link href="/" className="font-display text-heading font-semibold text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber" data-testid="wordmark">
          Navagraha <span lang="hi" className="text-lg text-on-navy-2">नवग्रह</span>
        </Link>
        <div className="flex flex-auto flex-wrap gap-[26px] text-nav">
          {PRIMARY_NAV.map((item) => {
            const current = active === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={current
                  ? 'border-b-2 border-amber pb-1 font-semibold text-on-navy'
                  : 'pb-1 text-on-navy-2 hover:text-on-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber'}
                data-testid={`nav-${item.id}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <AccountPill />
      </nav>
    </div>
  );
}
