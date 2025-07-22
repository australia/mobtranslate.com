'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/app/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Heart, 
  BarChart3, 
  Brain, 
  MessageCircle, 
  Settings, 
  User,
  LogOut,
  ChevronDown,
  Trophy,
  BookOpen,
  Home,
  Grid3X3
} from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

export function ModernNav() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchUsername();
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUsername = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        setUsername(data.profile?.display_name || data.profile?.username);
      }
    } catch (error) {
      console.error('Failed to fetch username:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUsername(null);
      router.push('/');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const primaryNavItems: NavItem[] = [
    { href: '/learn', label: 'Learn', icon: Brain },
    { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  ];

  const dropdownItems: NavItem[] = [
    { href: '/stats', label: 'Statistics', icon: BarChart3, description: 'View detailed stats' },
    { href: '/my-likes', label: 'My Likes', icon: Heart, description: 'Words you\'ve liked' },
    { href: '/chat', label: 'AI Chat', icon: MessageCircle, description: 'Chat with AI' },
    { href: '/settings', label: 'Settings', icon: Settings, description: 'Account settings' },
  ];

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-20 bg-gray-200 animate-pulse rounded" />
        <div className="h-8 w-20 bg-gray-200 animate-pulse rounded" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {/* Primary Navigation Items */}
        <nav className="hidden md:flex items-center gap-1">
          {primaryNavItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2 hover:bg-primary/10 transition-all"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Button>
            </Link>
          ))}
        </nav>

        {/* Mobile Primary Nav */}
        <nav className="flex md:hidden items-center gap-1">
          <Link href="/learn">
            <Button variant="ghost" size="sm" className="p-2">
              <Brain className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="p-2">
              <Home className="h-4 w-4" />
            </Button>
          </Link>
        </nav>

        {/* User Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={cn(
              "gap-2 transition-all",
              isDropdownOpen && "bg-primary/10 border-primary"
            )}
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline max-w-[100px] truncate">
              {username || 'Menu'}
            </span>
            <ChevronDown className={cn(
              "h-3 w-3 transition-transform",
              isDropdownOpen && "rotate-180"
            )} />
          </Button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 animate-slide-in">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium">{username || 'User'}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>

              {/* Menu Items */}
              <div className="py-2">
                {dropdownItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <button
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-start gap-3"
                    >
                      <item.icon className="h-4 w-4 text-gray-600 dark:text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500">{item.description}</p>
                        )}
                      </div>
                    </button>
                  </Link>
                ))}
              </div>

              {/* Sign Out */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3 text-red-600 dark:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm font-medium">Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/auth/signin">
        <Button variant="outline" size="sm">
          Sign in
        </Button>
      </Link>
      <Link href="/auth/signup">
        <Button size="sm" className="hidden sm:inline-flex">
          Get Started
        </Button>
      </Link>
    </div>
  );
}