import { useEffect, useRef } from 'react';
import useDashboardStore from '../store/dashboardStore';

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads all dashboard data on mount and sets up a polling interval.
 * Returns the full store state for convenience.
 */
export function useDashboard() {
  const { loadAll, ...state } = useDashboardStore();
  const timerRef = useRef(null);

  useEffect(() => {
    loadAll();

    timerRef.current = setInterval(() => {
      loadAll();
    }, REFRESH_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, loadAll };
}
