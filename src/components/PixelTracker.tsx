import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureFacebookBrowserIdentifiers, useTrackConversion } from '@/lib/hooks/useFacebookConversion';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function shouldTrackViewContent(pathname: string): boolean {
  return (
    pathname.startsWith('/catalogo') ||
    pathname === '/cadastro' ||
    pathname === '/checkout' ||
    pathname.startsWith('/pedido/sucesso')
  );
}

/**
 * PixelTracker component for Single Page Application (SPA) route tracking.
 * Listens to location changes and triggers Meta Pixel PageView events.
 */
const PixelTracker = () => {
  const location = useLocation();
  const trackConversion = useTrackConversion();

  useEffect(() => {
    captureFacebookBrowserIdentifiers(window.location.href);

    // Basic PageView tracking
    if (window.fbq) {
      // Don't track admin pages to avoid polluting marketing data
      if (!location.pathname.startsWith('/admin')) {
        window.fbq('track', 'PageView');
      }
    }

    if (shouldTrackViewContent(location.pathname)) {
      trackConversion({
        eventName: 'ViewContent',
        contentName: location.pathname,
        contentType: 'page',
      });
    }
  }, [location, trackConversion]);

  return null;
};

export default PixelTracker;
