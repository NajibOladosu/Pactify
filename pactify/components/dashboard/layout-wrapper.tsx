"use client";

import { useState, useEffect } from "react";
import { DashboardNav } from "./navigation";
import { DashboardHeader } from "./header";
import { MobileNav } from "./mobile-nav";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";

interface DashboardLayoutWrapperProps {
  children: React.ReactNode;
  userType: string;
  displayName: string;
  userInitial: string;
  userId: string;
}

export function DashboardLayoutWrapper({
  children,
  userType,
  displayName,
  userInitial,
  userId
}: DashboardLayoutWrapperProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useLocalStorage<string>(`pactify-subscription-${userId}`, "free");
  
  // Check localStorage for subscription status on component mount
  useEffect(() => {
    try {
      const savedSubscription = localStorage.getItem('subscription');
      if (savedSubscription) {
        const subscription = JSON.parse(savedSubscription);
        if (subscription.status === 'active') {
          setCurrentPlan(subscription.plan);
        }
      }
    } catch (error) {
      console.error("Failed to load subscription data:", error);
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop */}
      <DashboardNav
        userType={userType}
        displayName={displayName}
        userInitial={userInitial}
        currentPlan={currentPlan}
      />
      
      {/* Mobile Navigation */}
      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        userType={userType}
        currentPlan={currentPlan}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <DashboardHeader
          userType={userType}
          displayName={displayName}
          userInitial={userInitial}
          mobileNavOpen={mobileNavOpen}
          setMobileNavOpen={setMobileNavOpen}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-background/95">
          {children}
        </main>
      </div>
    </div>
  );
}
