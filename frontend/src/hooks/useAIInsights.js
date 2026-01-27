import { useCallback, useEffect, useRef, useState } from 'react';
import { getInsights } from '@/api/ml';

export default function useAIInsights(options = {}) {
  const { autoRefresh = true, interval = 45000 } = options;
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await getInsights();
      setData(payload);
    } catch (err) {
      console.error('Не удалось загрузить инсайты ИИ', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    timerRef.current = setInterval(fetchData, interval);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoRefresh, interval, fetchData]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchData,
  };
}
