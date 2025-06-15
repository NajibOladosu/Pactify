"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { 
  PlusIcon, 
  BarChart3Icon, 
  LayoutDashboardIcon,
  TrendingUpIcon
} from "lucide-react";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { RecentContracts } from "@/components/dashboard/recent-contracts";
import AnalyticsDashboard from "@/components/dashboard/analytics-dashboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DashboardWrapperProps {
  displayName: string;
  userType: string;
  userId: string;
  activeContractsCount: number;
  maxContracts: number | null;
  isLimitReached: boolean;
  greeting: string;
  recentContracts: Array<{
    id: string;
    title: string | null;
    status: string | null;
    created_at: string;
  }>;
}

export default function DashboardWrapper({
  displayName,
  userType,
  userId,
  activeContractsCount,
  maxContracts,
  isLimitReached,
  greeting,
  recentContracts
}: DashboardWrapperProps) {
  const [activeView, setActiveView] = useState<'overview' | 'analytics'>('overview');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">{greeting}, {displayName}!</h1>
          <p className="text-muted-foreground mt-1">
            {activeView === 'overview' 
              ? "Here's what's happening with your contracts today."
              : "Detailed insights and analytics for your business."
            }
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex border rounded-lg p-1">
            <Button
              variant={activeView === 'overview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('overview')}
              className="text-xs"
            >
              <LayoutDashboardIcon className="h-4 w-4 mr-1" />
              Overview
            </Button>
            <Button
              variant={activeView === 'analytics' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('analytics')}
              className="text-xs"
            >
              <BarChart3Icon className="h-4 w-4 mr-1" />
              Analytics
            </Button>
          </div>

          {/* New Contract Button */}
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className={isLimitReached ? 'cursor-not-allowed' : ''}>
                  <Button size="sm" asChild={!isLimitReached} disabled={isLimitReached}>
                    {isLimitReached ? (
                      <span className="inline-flex items-center px-3 py-1.5">
                        <PlusIcon className="mr-2 h-4 w-4" />
                        New Contract
                      </span>
                    ) : (
                      <Link href="/dashboard/contracts/new">
                        <PlusIcon className="mr-2 h-4 w-4" />
                        New Contract
                      </Link>
                    )}
                  </Button>
                </div>
              </TooltipTrigger>
              {isLimitReached && (
                <TooltipContent>
                  <p>Upgrade to create more contracts.</p>
                  <p className="text-xs text-muted-foreground">Free plan limit ({maxContracts}) reached.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Content based on active view */}
      {activeView === 'overview' ? (
        <div className="space-y-8">
          {/* Quick Stats */}
          <DashboardStats
            userType={userType}
            activeContractsCount={activeContractsCount}
            maxContracts={maxContracts}
          />

          {/* Main content section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Recent contracts */}
            <div className="lg:col-span-2">
              <RecentContracts contracts={recentContracts} />
            </div>

            {/* Get started cards */}
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>Complete these steps to set up your account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Create your account</h4>
                      <p className="text-xs text-muted-foreground">You've successfully created your account.</p>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-background flex items-center justify-center border">
                      <span className="text-sm font-medium">2</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Complete your profile</h4>
                      <p className="text-xs text-muted-foreground mb-2">Add your business details and contact information.</p>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/dashboard/settings">
                          Complete profile
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-background flex items-center justify-center border">
                      <span className="text-sm font-medium">3</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-1">Create your first contract</h4>
                      <p className="text-xs text-muted-foreground mb-2">Select a template or create a custom contract.</p>
                      <Button size="sm" asChild>
                        <Link href="/dashboard/contracts/new">
                          Create contract
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Analytics Preview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUpIcon className="h-5 w-5" />
                    Quick Analytics
                  </CardTitle>
                  <CardDescription>Get a quick overview of your performance</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setActiveView('analytics')}
                >
                  View Full Analytics
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                <div className="space-y-2">
                  <p className="text-2xl font-bold">{activeContractsCount}</p>
                  <p className="text-sm text-muted-foreground">Active Contracts</p>
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-bold">$0</p>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Completed Projects</p>
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-bold">-</p>
                  <p className="text-sm text-muted-foreground">Avg Rating</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <AnalyticsDashboard userId={userId} userType={userType} />
      )}
    </div>
  );
}