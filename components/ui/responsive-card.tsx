"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
// Simple mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

interface ResponsiveCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  noPadding?: boolean;
  actions?: React.ReactNode;
}

export function ResponsiveCard({
  title,
  description,
  children,
  className,
  compact = false,
  noPadding = false,
  actions
}: ResponsiveCardProps) {
  const isMobile = useIsMobile();

  return (
    <Card className={cn(
      "w-full",
      isMobile && "border-0 shadow-none rounded-none bg-transparent",
      className
    )}>
      {(title || description || actions) && (
        <CardHeader className={cn(
          compact && "pb-3",
          noPadding && "p-0",
          isMobile && "px-0 py-4"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {title && (
                <CardTitle className={cn(
                  isMobile ? "text-lg" : "text-xl"
                )}>
                  {title}
                </CardTitle>
              )}
              {description && (
                <CardDescription className={cn(
                  isMobile && "text-sm mt-1"
                )}>
                  {description}
                </CardDescription>
              )}
            </div>
            {actions && (
              <div className={cn(
                "flex items-center gap-2",
                isMobile && "ml-4"
              )}>
                {actions}
              </div>
            )}
          </div>
        </CardHeader>
      )}
      
      <CardContent className={cn(
        noPadding && "p-0",
        isMobile && "px-0 pb-4"
      )}>
        {children}
      </CardContent>
    </Card>
  );
}

// Responsive grid container for cards
export function ResponsiveCardGrid({
  children,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = "gap-4 md:gap-6",
  className
}: {
  children: React.ReactNode;
  columns?: { mobile?: number; tablet?: number; desktop?: number };
  gap?: string;
  className?: string;
}) {
  const gridCols = cn(
    `grid-cols-${columns.mobile || 1}`,
    columns.tablet && `md:grid-cols-${columns.tablet}`,
    columns.desktop && `lg:grid-cols-${columns.desktop}`
  );

  return (
    <div className={cn(
      "grid",
      gridCols,
      gap,
      className
    )}>
      {children}
    </div>
  );
}

// Responsive list view for mobile-first design
export function ResponsiveList({
  items,
  renderItem,
  className,
  emptyState
}: {
  items: any[];
  renderItem: (item: any, index: number) => React.ReactNode;
  className?: string;
  emptyState?: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  if (items.length === 0 && emptyState) {
    return <div className={cn("py-8", className)}>{emptyState}</div>;
  }

  return (
    <div className={cn(
      "space-y-2",
      !isMobile && "space-y-4",
      className
    )}>
      {items.map((item, index) => (
        <div 
          key={index}
          className={cn(
            isMobile && "border-b border-border last:border-b-0 pb-4 last:pb-0"
          )}
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}