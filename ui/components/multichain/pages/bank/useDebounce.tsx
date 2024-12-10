import { useEffect, useState } from 'react';

export function useDebounce<Generic>(value: Generic, delay?: number): Generic {
  const [debouncedValue, setDebouncedValue] = useState<Generic>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay ?? 500);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
