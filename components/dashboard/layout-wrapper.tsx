"use client";

import { useState, useEffect } from "react";
import { DashboardNav } from "./navigation";
import { DashboardHeader } from "./header";
import { MobileNav } from "./mobile-nav";
// Removed useLocalStorage import

interface DashboardLayoutWrapperProps {
  children: React.ReactNode;
  userType: string;
  displayName: string;
  userInitial: string;
  userId: string;
  currentPlan: string; // Add currentPlan prop
}

export function DashboardLayoutWrapper({
  children,
  userType,
  displayName,
  userInitial,
  userId,
  currentPlan // Accept currentPlan as a prop
}: DashboardLayoutWrapperProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Removed local state and useEffect for currentPlan

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop */}
      <div className="hidden md:block">
        <DashboardNav
          userType={userType}
          displayName={displayName}
          userInitial={userInitial}
          currentPlan={currentPlan} // Pass the prop down
        />
      </div>

      {/* Mobile Navigation Overlay */}
      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        userType={userType}
        currentPlan={currentPlan} // Pass the prop down
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Header */}
        <DashboardHeader
          userType={userType}
          displayName={displayName}
          userInitial={userInitial}
          mobileNavOpen={mobileNavOpen}
          setMobileNavOpen={setMobileNavOpen}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-background/95">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
