import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { 
  FileTextIcon, 
  HomeIcon, 
  LayoutDashboardIcon,
  CreditCardIcon, 
  UsersIcon, 
  SettingsIcon,
  PlusIcon,
  BellIcon,
  UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const userType = profile?.user_type || user.user_metadata?.user_type || "both";
  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0];
  const userInitial = (displayName || "U")[0].toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
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
              <Link href="/dashboard" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground bg-accent/50">
                <LayoutDashboardIcon className="mr-3 h-5 w-5 text-primary-500" />
                Dashboard
              </Link>
              
              <Link href="/dashboard/contracts" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <FileTextIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                Contracts
              </Link>
              
              <Link href="/dashboard/payments" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <CreditCardIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                Payments
              </Link>
              
              <Link href="/dashboard/clients" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <UsersIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                {userType === 'client' ? 'Freelancers' : 'Clients'}
              </Link>
            </div>
          </div>
          
          <div className="py-2">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Templates
            </p>
            <div className="mt-2 space-y-1">
              <Link href="/dashboard/templates" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <FileTextIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                My Templates
              </Link>
              
              <Link href="/templates" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <FileTextIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                Template Gallery
              </Link>
            </div>
          </div>
          
          <div className="py-2">
            <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Account
            </p>
            <div className="mt-2 space-y-1">
              <Link href="/dashboard/settings" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <SettingsIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                Settings
              </Link>
              
              <Link href="/dashboard/subscription" className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                <CreditCardIcon className="mr-3 h-5 w-5 text-muted-foreground" />
                Subscription
                <span className="ml-auto bg-primary-500 text-white text-xs py-0.5 px-2 rounded-full">
                  Free
                </span>
              </Link>
              
              <form action={signOutAction}>
                <button type="submit" className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent/50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mr-3 h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center h-16 px-6 border-b border-border justify-between">
          {/* Mobile menu button */}
          <button className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground">
            <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Quick actions */}
          <div className="md:hidden">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-primary-500 font-bold text-xl font-serif">Pactify</span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center">
            <Button variant="outline" size="sm" className="mr-4">
              <PlusIcon className="mr-2 h-4 w-4" />
              New Contract
            </Button>
          </div>
          
          {/* User menu & notification */}
          <div className="flex items-center gap-3">
            <button className="p-1 rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500">
              <BellIcon className="h-6 w-6" />
            </button>
            
            <div className="relative">
              <button className="flex items-center gap-2 focus:outline-none">
                <div className="flex-shrink-0 h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white font-medium">
                  {userInitial}
                </div>
                <span className="hidden md:inline-block text-sm font-medium truncate max-w-[120px]">
                  {displayName}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-background/95">
          {children}
        </main>
      </div>
    </div>
  );
}
