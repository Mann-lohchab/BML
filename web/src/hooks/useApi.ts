import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi<T>(load: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef(0);

  const reload = useCallback(async () => {
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (activeRequest.current === requestId) setData(result);
      return result;
    } catch (caught) {
      const resolved = caught instanceof Error ? caught : new Error(String(caught));
      if (activeRequest.current === requestId) setError(resolved);
      throw resolved;
    } finally {
      if (activeRequest.current === requestId) setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void reload().catch(() => undefined);
    return () => {
      activeRequest.current += 1;
    };
  }, [reload]);

  return { data, setData, error, loading, reload };
}
