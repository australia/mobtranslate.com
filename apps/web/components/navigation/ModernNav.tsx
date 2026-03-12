'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, cn } from '@mobtranslate/ui';
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
  Home,
  Shield,
  FileCheck
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  description?: string;
}

export function ModernNav() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchUsername();
    } else {
      setUsername(null);
      setUserRole(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Check user role using Supabase directly
      if (user && typeof window !== 'undefined') {
        try {
          const supabase = createClient();
          const { data: roleData, error } = await supabase
            .rpc('get_user_language_role', {
              user_uuid: user.id,
              lang_id: null
            });

          if (error) {
            console.error('Error fetching user role:', error);
          } else if (roleData) {
            setUserRole(roleData);
          }
        } catch (err) {
          console.error('Failed to fetch user role:', err);
        }
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

  // Add admin/curator items based on role
  const isAdmin = userRole === 'super_admin' || userRole === 'dictionary_admin';
  const isCurator = userRole === 'curator' || isAdmin;

  // Add curator dashboard for curators
  if (isCurator) {
    dropdownItems.splice(1, 0, {
      href: '/curator',
      label: 'Curator Dashboard',
      icon: FileCheck,
      description: 'Review submissions'
    });
  }

  // Add admin panel for admins
  if (isAdmin) {
    dropdownItems.splice(1, 0, {
      href: '/admin',
      label: 'Admin Panel',
      icon: Shield,
      description: 'System administration'
    });
  }

  // Get user initials for avatar
  const getInitials = (name: string | null): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-20 bg-muted animate-pulse rounded-lg" />
        <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {/* Primary Navigation Items */}
        <nav className="hidden md:flex items-center gap-0.5">
          {primaryNavItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                size="md"
                className={cn(
                  "gap-2 px-3.5 py-2 rounded-lg transition-all duration-200",
                  "hover:bg-primary/10 hover:text-primary",
                  "active:scale-[0.97]"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="font-medium text-sm">{item.label}</span>
              </Button>
            </Link>
          ))}
        </nav>

        {/* Mobile Primary Nav */}
        <nav className="flex md:hidden items-center gap-0.5">
          <Link href="/learn">
            <Button variant="ghost" size="sm" className="p-2 rounded-lg hover:bg-primary/10">
              <Brain className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="p-2 rounded-lg hover:bg-primary/10">
              <Home className="h-4 w-4" />
            </Button>
          </Link>
        </nav>

        {/* User Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={cn(
              "gap-2 transition-all duration-200 rounded-full pl-1.5 pr-2.5 py-1.5",
              "hover:bg-muted",
              isDropdownOpen && "bg-muted ring-2 ring-primary/20"
            )}
          >
            {/* Avatar with initials */}
            <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
              {getInitials(username)}
            </span>
            <span className="hidden sm:inline max-w-[100px] truncate text-sm font-medium">
              {username || 'Menu'}
            </span>
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground transition-transform duration-200",
              isDropdownOpen && "rotate-180"
            )} />
          </Button>

          {/* Dropdown Menu */}
          <div
            className={cn(
              "absolute right-0 mt-2 w-72 bg-card rounded-xl border border-border z-50",
              "shadow-lg shadow-black/5 dark:shadow-black/20",
              "transition-all duration-200 origin-top-right",
              isDropdownOpen
                ? "opacity-100 scale-100 translate-y-0"
                : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
            )}
          >
            {/* User Info Header */}
            <div className="px-4 py-3.5 border-b border-border/60 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                {getInitials(username)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{username || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1.5 px-1.5">
              {dropdownItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <button
                    onClick={() => setIsDropdownOpen(false)}
                    className={cn(
                      "w-full px-3 py-2.5 text-left transition-colors duration-150 flex items-start gap-3 rounded-lg",
                      "hover:bg-muted/70 group"
                    )}
                  >
                    <span className="w-8 h-8 rounded-lg bg-muted group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors duration-150">
                      <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-150" />
                    </span>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </button>
                </Link>
              ))}
            </div>

            {/* Sign Out */}
            <div className="border-t border-border/60 p-1.5">
              <button
                onClick={handleSignOut}
                className={cn(
                  "w-full px-3 py-2.5 text-left transition-colors duration-150 flex items-center gap-3 rounded-lg",
                  "hover:bg-destructive/10 text-destructive group"
                )}
              >
                <span className="w-8 h-8 rounded-lg bg-destructive/5 group-hover:bg-destructive/10 flex items-center justify-center shrink-0 transition-colors duration-150">
                  <LogOut className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <Link href="/auth/signin">
        <Button
          variant="ghost"
          size="sm"
          className="text-sm font-medium hover:bg-muted transition-colors duration-200 rounded-lg"
        >
          Sign in
        </Button>
      </Link>
      <Link href="/auth/signup">
        <Button
          size="sm"
          className={cn(
            "hidden sm:inline-flex text-sm font-medium rounded-lg",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            "shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/25",
            "transition-all duration-200 active:scale-[0.97]"
          )}
        >
          Get Started
        </Button>
      </Link>
    </div>
  );
}
