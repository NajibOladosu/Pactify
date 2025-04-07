"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FileTextIcon, 
  HomeIcon, 
  LayoutDashboardIcon,
  CreditCardIcon, 
  UsersIcon, 
  SettingsIcon,
  LogOutIcon
} from "lucide-react";
import { signOutAction } from "@/app/actions";

interface DashboardNavProps {
  userType: string;
  displayName: string;
  userInitial: string;
  currentPlan?: string;
}

export function DashboardNav({ userType, displayName, userInitial, currentPlan = "free" }: DashboardNavProps) {
  const pathname = usePathname();
  
  const isActiveLink = (path: string) => {
    if (path === '/dashboard' && pathname === '/dashboard') {
      return true;
    }
    if (path !== '/dashboard' && pathname.startsWith(path)) {
      return true;
    }
    return false;
  };

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-border bg-background">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-primary-500 font-bold text-2xl font-serif">Pactify</span>
        </Link>
      </div>
      
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        <div className="py-2">
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Main
          </p>
          <div className="mt-2 space-y-1">
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
        
        <div className="py-2">
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Templates
          </p>
          <div className="mt-2 space-y-1">
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
        
        <div className="py-2">
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Account
          </p>
          <div className="mt-2 space-y-1">
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
            
            <form action={signOutAction}>
              <button type="submit" className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <LogOutIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </nav>
    </aside>
  );
}
