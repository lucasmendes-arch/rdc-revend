import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    fbq: any;
  }
}

/**
 * PixelTracker component for Single Page Application (SPA) route tracking.
 * Listens to location changes and triggers Meta Pixel PageView events.
 */
const PixelTracker = () => {
  const location = useLocation();

  useEffect(() => {
    // Basic PageView tracking
    if (window.fbq) {
      // Don't track admin pages to avoid polluting marketing data
      if (!location.pathname.startsWith('/admin')) {
        window.fbq('track', 'PageView');
      }
    }
  }, [location]);

  return null;
};

export default PixelTracker;
