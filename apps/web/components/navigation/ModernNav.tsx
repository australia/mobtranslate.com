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

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-20 bg-muted animate-pulse rounded" />
        <div className="h-8 w-20 bg-muted animate-pulse rounded" />
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
                size="md"
                className="gap-2 hover:bg-primary/10 transition-all px-4 py-2.5"
              >
                <item.icon className="h-4 w-4" />
                <span className="font-medium">{item.label}</span>
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
            <div className="absolute right-0 mt-2 w-64 bg-card rounded-lg shadow-lg border border-border py-2 z-50 animate-slide-in">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium">{username || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>

              {/* Menu Items */}
              <div className="py-2">
                {dropdownItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="ghost"
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full px-4 py-2 h-auto text-left hover:bg-muted transition-colors flex items-start gap-3 rounded-none justify-start"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                    </Button>
                  </Link>
                ))}
              </div>

              {/* Sign Out */}
              <div className="border-t border-border pt-2">
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 h-auto text-left hover:bg-destructive/10 transition-colors flex items-center gap-3 text-destructive rounded-none justify-start"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm font-medium">Sign out</span>
                </Button>
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