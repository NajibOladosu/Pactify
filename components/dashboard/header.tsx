"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  BellIcon, 
  ChevronDownIcon,
  MenuIcon,
  UserIcon,
  SettingsIcon,
  LogOutIcon,
  PaletteIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions";
import { ThemeSwitcher } from "@/components/theme-switcher";

interface DashboardHeaderProps {
  userType: string;
  displayName: string;
  userInitial: string;
  mobileNavOpen?: boolean;
  setMobileNavOpen?: (open: boolean) => void;
}

export function DashboardHeader({ 
  userType, 
  displayName, 
  userInitial,
  mobileNavOpen,
  setMobileNavOpen
}: DashboardHeaderProps) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  const toggleMobileNav = () => {
    if (setMobileNavOpen) {
      setMobileNavOpen(!mobileNavOpen);
    }
  };

  return (
    <header className="flex items-center h-16 px-4 sm:px-6 border-b border-border">
      {/* Mobile menu button */}
      <button 
        className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 mr-auto"
        onClick={toggleMobileNav}
        aria-label="Toggle mobile navigation"
      >
        <MenuIcon className="h-6 w-6" />
      </button>
      
      {/* User menu & notification */}
      <div className="flex items-center gap-3 ml-auto">
        <button className="p-1 rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500">
          <BellIcon className="h-6 w-6" />
        </button>
        
        <div className="relative">
          <button 
            className="flex items-center gap-2 focus:outline-none"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <div className="flex-shrink-0 h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium">
              {userInitial}
            </div>
            <span className="hidden md:inline-block text-sm font-medium truncate max-w-[120px]">
              {displayName}
            </span>
            <ChevronDownIcon className="hidden md:inline-block h-4 w-4 text-muted-foreground" />
          </button>
          
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 py-2 bg-background border border-border rounded-md shadow-lg z-10">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {userType === 'freelancer' ? 'Freelancer' : userType === 'client' ? 'Client' : 'Freelancer & Client'}
                </p>
              </div>
              
              <Link
                href="/dashboard/settings"
                className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-accent/40 transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <SettingsIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                Account Settings
              </Link>
              
              <Link
                href="/dashboard/subscription"
                className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-accent/40 transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <UserIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                Subscription
              </Link>
              
              <div className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-accent/40 transition-colors">
                <PaletteIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="mr-auto">Theme</span>
                <ThemeSwitcher />
              </div>
              
              <div className="border-t border-border mt-2 pt-2">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full flex items-center px-4 py-2 text-sm text-foreground hover:bg-accent/40 transition-colors text-left"
                  >
                    <LogOutIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
