import { Link, useLocation } from 'wouter';
import { Home, MessageCircle, Sparkles, BookOpen, User } from 'lucide-react';

const navItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/astrologers', icon: MessageCircle, label: 'Consult' },
  { href: '/kundli/new', icon: Sparkles, label: 'Kundli' },
  { href: '/schedule', icon: BookOpen, label: 'Schedule' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden safe-area-pb shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = location === href || (href !== '/' && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <div className={`flex flex-col items-center py-1.5 px-1 cursor-pointer transition-all ${
                isActive ? 'text-orange-600' : 'text-gray-400'
              }`}>
                <div className={`p-1.5 rounded-full transition-colors ${isActive ? 'bg-orange-50' : ''}`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                </div>
                <span className={`text-[10px] mt-0.5 font-semibold ${isActive ? 'text-orange-600' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
