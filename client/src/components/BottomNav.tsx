import { Link, useLocation } from 'wouter';
import { Home, Users, Sparkles, Calendar, User } from 'lucide-react';

const navItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/astrologers', icon: Users, label: 'Astrologers' },
  { href: '/kundli/new', icon: Sparkles, label: 'Kundli' },
  { href: '/schedule', icon: Calendar, label: 'Schedule' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden safe-area-pb">
      <div className="grid grid-cols-5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = location === href || (href !== '/' && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <div className={`flex flex-col items-center py-2 px-1 cursor-pointer transition-colors ${
                isActive ? 'text-[#1A1A1A]' : 'text-gray-400'
              }`}>
                <div className={`p-1 rounded-lg ${isActive ? 'bg-[#FFCF23]' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs mt-0.5 font-medium ${isActive ? 'text-[#1A1A1A]' : 'text-gray-400'}`}>
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
