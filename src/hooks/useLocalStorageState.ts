"use client";

import { useEffect, useState } from 'react';

/**
 * State backed by localStorage, scoped per browser (i.e. per annotator on a
 * shared machine login). Reads after mount to avoid SSR hydration mismatches:
 * the first render uses `initial`, then the stored value is applied.
 */
export function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed/unavailable storage */
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota/unavailable storage */
    }
  }, [key, value, loaded]);

  return [value, setValue] as const;
}
