import { Link } from 'wouter';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/lib/marketplace';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { moreItems } from './navigation';

type User = { firstName?: string | null; name?: string | null; email?: string | null };

export function accountLabel(user: unknown): string {
  const u = user as User | undefined;
  return u?.firstName?.trim() || u?.name?.trim()?.split(' ')[0] || 'Account';
}

const logOut = () => { window.location.href = '/api/logout'; };

/** Desktop: the account pill in the navy band, opening a menu of the rest of the app. */
export function AccountPill() {
  const { user, isAuthenticated } = useAuth();
  const marketplace = useMarketplace();
  const pill = 'inline-flex min-h-10 items-center rounded-full border border-navy-control px-3.5 py-2 text-sm text-on-navy hover:border-on-navy-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber';
  if (!isAuthenticated) return <Link href="/" className={pill} data-testid="nav-sign-in">Sign in</Link>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={pill} data-testid="nav-account">{accountLabel(user)}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {moreItems(marketplace, true).map((m) => (
          <DropdownMenuItem key={m.href} asChild><Link href={m.href} className="cursor-pointer">{m.label}</Link></DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer text-negative" onSelect={logOut}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mobile: a 44px account button in the navy header, opening a bottom sheet. */
export function AccountSheetButton() {
  const { user, isAuthenticated } = useAuth();
  const marketplace = useMarketplace();
  const [open, setOpen] = useState(false);
  const button = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-navy-control text-on-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber';
  const icon = (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
  );
  if (!isAuthenticated) return <Link href="/" className={button} aria-label="Sign in">{icon}</Link>;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={button} aria-label="Account and more" data-testid="mobile-account">{icon}</SheetTrigger>
      <SheetContent side="bottom" className="p-0 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-1 px-5 pt-2.5">
          <span aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
          <SheetTitle className="font-display text-card-title font-semibold">{accountLabel(user)}</SheetTitle>
          <nav aria-label="More" className="grid grid-cols-2 gap-x-4">
            {moreItems(marketplace, false).map((m) => (
              <Link key={m.href} href={m.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center border-b border-hairline text-base text-ink">{m.label}</Link>
            ))}
          </nav>
          <button type="button" onClick={logOut} className="mt-2 flex min-h-11 items-center text-base font-semibold text-negative">Log out</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
