import { ComponentType, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Generic loading spinner component
const LoadingSpinner = ({ className = "h-6 w-6" }: { className?: string }) => (
  <div className="flex items-center justify-center p-4">
    <Loader2 className={`animate-spin ${className}`} />
  </div>
);

// Higher-order component for lazy loading with better error boundaries
export function withLazyLoading<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback?: React.ComponentType
) {
  const LazyComponent = lazy(importFn);
  
  return function LazyLoadedComponent(props: React.ComponentProps<T>) {
    const Fallback = fallback || LoadingSpinner;
    
    return (
      <Suspense fallback={<Fallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Intersection Observer hook for lazy loading content
export function useIntersectionObserver(
  callback: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit
) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(callback);
  }, options);

  return observer;
}

// Debounce function for performance
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(null, args), wait);
  };
}

// Throttle function for scroll events
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, wait);
    }
  };
}

// Image lazy loading with placeholder
export const LazyImage = ({ 
  src, 
  alt, 
  className = "",
  placeholder = "blur",
  ...props 
}: {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  [key: string]: any;
}) => {
  return (
    <img
      src={src}
      alt={alt}
      className={`transition-opacity duration-300 ${className}`}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
};

// Preload critical resources
export function preloadResource(href: string, type: 'script' | 'style' | 'font' | 'image' = 'script') {
  if (typeof window === 'undefined') return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = type;
  
  if (type === 'font') {
    link.crossOrigin = 'anonymous';
  }
  
  document.head.appendChild(link);
}

// Optimize bundle splitting
export const lazyComponents = {
  // Critical components that should be loaded immediately
  ContractEditor: () => import('@/components/contracts/contract-editor'),
  PaymentManager: () => import('@/components/contracts/payment-release-manager'),
  
  // Non-critical components that can be lazy loaded
  Charts: () => import('@/components/analytics/charts'),
  PDFViewer: () => import('@/components/documents/pdf-viewer'),
  SignaturePad: () => import('@/components/contracts/digital-signature-pad'),
};

// Service worker registration for caching
export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  }
}