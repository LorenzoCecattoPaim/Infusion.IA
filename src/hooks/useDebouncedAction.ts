import { useCallback, useRef } from "react";

export function useDebouncedAction(delayMs = 500) {
  const lastRunRef = useRef(0);

  return useCallback(
    (action: () => void) => {
      const now = Date.now();
      if (now - lastRunRef.current < delayMs) {
        return false;
      }

      lastRunRef.current = now;
      action();
      return true;
    },
    [delayMs]
  );
}
