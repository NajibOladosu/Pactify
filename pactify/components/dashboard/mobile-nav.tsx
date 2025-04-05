"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FileTextIcon, 
  HomeIcon, 
  LayoutDashboardIcon,
  CreditCardIcon, 
  UsersIcon, 
  SettingsIcon,
  XIcon
} from "lucide-react";
import { signOutAction } from "@/app/actions";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  userType: string;
  currentPlan?: string;
}

export function MobileNav({ open, onClose, userType, currentPlan = "free" }: MobileNavProps) {
  const pathname = usePathname();
  
  // Close the mobile menu when navigating
  useEffect(() => {
    if (open) {
      onClose();
    }
  }, [pathname]);
  
  const isActiveLink = (path: string) => {
    if (path === '/dashboard' && pathname === '/dashboard') {
      return true;
    }
    if (path !== '/dashboard' && pathname.startsWith(path)) {
      return true;
    }
    return false;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background md:hidden">
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-primary-500 font-bold text-2xl font-serif">Pactify</span>
          </Link>
          
          <button
            type="button"
            className="text-muted-foreground p-2 rounded-md"
            onClick={onClose}
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-6">
          <div>
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Main
            </p>
            <div className="mt-3 space-y-3">
              <Link 
                href="/dashboard" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <LayoutDashboardIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                Dashboard
              </Link>
              
              <Link 
                href="/dashboard/contracts" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard/contracts') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <FileTextIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard/contracts') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                Contracts
              </Link>
              
              <Link 
                href="/dashboard/payments" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard/payments') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <CreditCardIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard/payments') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                Payments
              </Link>
              
              <Link 
                href="/dashboard/clients" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard/clients') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <UsersIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard/clients') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                {userType === 'client' ? 'Freelancers' : 'Clients'}
              </Link>
            </div>
          </div>
          
          <div>
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Templates
            </p>
            <div className="mt-3 space-y-3">
              <Link 
                href="/dashboard/templates" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard/templates') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <FileTextIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard/templates') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                My Templates
              </Link>
              
              <Link 
                href="/templates" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/templates') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <FileTextIcon className={`mr-3 h-5 w-5 ${isActiveLink('/templates') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                Template Gallery
              </Link>
            </div>
          </div>
          
          <div>
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Account
            </p>
            <div className="mt-3 space-y-3">
              <Link 
                href="/dashboard/settings" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard/settings') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <SettingsIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard/settings') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                Settings
              </Link>
              
              <Link 
                href="/dashboard/subscription" 
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActiveLink('/dashboard/subscription') 
                    ? 'text-primary-500 bg-primary-500/10 hover:bg-primary-500/15' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <CreditCardIcon className={`mr-3 h-5 w-5 ${isActiveLink('/dashboard/subscription') ? 'text-primary-500' : 'text-muted-foreground'}`} />
                Subscription
                <span className={`ml-auto text-xs py-0.5 px-2 rounded-full ${
                  currentPlan === 'free' 
                    ? 'bg-muted text-muted-foreground' 
                    : currentPlan === 'professional'
                      ? 'bg-primary-500 text-white'
                      : 'bg-accent-500 text-white'
                }`}>
                  {currentPlan === 'free' ? 'Free' : currentPlan === 'professional' ? 'Pro' : 'Business'}
                </span>
              </Link>
            </div>
          </div>
          
          <div className="pt-6 mt-6 border-t border-border">
            <form action={signOutAction}>
              <button 
                type="submit"
                className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-destructive hover:bg-destructive/10 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </form>
          </div>
        </nav>
      </div>
    </div>
  );
}
