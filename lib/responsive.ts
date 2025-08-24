import { useEffect, useState } from 'react';

// Breakpoint definitions matching Tailwind's defaults
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// Hook to detect screen size
export function useScreenSize() {
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    function updateScreenSize() {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener('resize', updateScreenSize);
    updateScreenSize();

    return () => window.removeEventListener('resize', updateScreenSize);
  }, []);

  return screenSize;
}

// Hook to detect if screen is mobile
export function useIsMobile() {
  const { width } = useScreenSize();
  return width < breakpoints.md;
}

// Hook to detect if screen is tablet
export function useIsTablet() {
  const { width } = useScreenSize();
  return width >= breakpoints.md && width < breakpoints.lg;
}

// Hook to detect if screen is desktop
export function useIsDesktop() {
  const { width } = useScreenSize();
  return width >= breakpoints.lg;
}

// Responsive class helper
export function responsive(classes: {
  base?: string;
  sm?: string;
  md?: string;
  lg?: string;
  xl?: string;
  '2xl'?: string;
}) {
  return Object.entries(classes)
    .map(([breakpoint, className]) => {
      if (breakpoint === 'base') return className;
      return className?.split(' ').map(c => `${breakpoint}:${c}`).join(' ');
    })
    .filter(Boolean)
    .join(' ');
}

// Container sizes for different breakpoints
export const containerSizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
} as const;

// Grid responsive classes
export const gridResponsive = {
  mobile: 'grid-cols-1',
  tablet: 'md:grid-cols-2',
  desktop: 'lg:grid-cols-3',
  wide: 'xl:grid-cols-4',
} as const;

// Common responsive patterns
export const patterns = {
  // Navigation patterns
  nav: {
    desktop: 'hidden lg:flex',
    mobile: 'lg:hidden',
  },
  
  // Layout patterns
  sidebar: {
    hidden: 'hidden lg:block',
    overlay: 'fixed inset-0 z-50 lg:hidden',
  },
  
  // Content patterns
  content: {
    padding: 'p-4 sm:p-6 lg:p-8',
    margin: 'm-4 sm:m-6 lg:m-8',
    gap: 'gap-4 sm:gap-6 lg:gap-8',
  },
  
  // Typography patterns
  text: {
    heading: 'text-xl sm:text-2xl lg:text-3xl',
    subheading: 'text-lg sm:text-xl lg:text-2xl',
    body: 'text-sm sm:text-base',
  },
} as const;

// Touch and gesture utilities
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Optimize images for different screen sizes
export function getResponsiveImageSrc(
  baseSrc: string,
  screenWidth: number
) {
  if (screenWidth <= breakpoints.sm) return `${baseSrc}?w=640`;
  if (screenWidth <= breakpoints.md) return `${baseSrc}?w=768`;
  if (screenWidth <= breakpoints.lg) return `${baseSrc}?w=1024`;
  if (screenWidth <= breakpoints.xl) return `${baseSrc}?w=1280`;
  return `${baseSrc}?w=1920`;
}

// Safe area utilities for mobile devices with notches
export const safeArea = {
  top: 'pt-safe-area-inset-top',
  bottom: 'pb-safe-area-inset-bottom',
  left: 'pl-safe-area-inset-left',
  right: 'pr-safe-area-inset-right',
  all: 'p-safe-area-inset',
} as const;