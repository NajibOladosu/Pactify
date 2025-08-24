"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  disabled?: boolean;
}

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  actions: ActionItem[];
  children?: React.ReactNode;
}

export function MobileActionSheet({
  isOpen,
  onClose,
  title,
  actions,
  children
}: MobileActionSheetProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    // On desktop, render as regular buttons in a horizontal layout
    return (
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant || 'default'}
            onClick={action.onClick}
            disabled={action.disabled}
            className="flex items-center gap-2"
          >
            {action.icon}
            <span className="hidden sm:inline">{action.label}</span>
          </Button>
        ))}
        {children}
      </div>
    );
  }

  // On mobile, render as action sheet
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bottom-0 top-auto translate-y-0 rounded-t-lg rounded-b-none border-0 p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-left">{title}</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-2 p-4 pt-2">
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || 'default'}
              onClick={() => {
                action.onClick();
                onClose();
              }}
              disabled={action.disabled}
              className={cn(
                "w-full justify-start gap-3 h-12",
                action.variant === 'destructive' && "text-destructive bg-transparent hover:bg-destructive/10"
              )}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          
          {children}
          
          <Button 
            variant="outline" 
            onClick={onClose}
            className="mt-2"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for managing action sheet state
export function useActionSheet() {
  const [isOpen, setIsOpen] = React.useState(false);
  
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  
  return { isOpen, open, close };
}