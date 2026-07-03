"use client";
import { useEffect, useState } from "react";

export function usePersistentState<T>(
  key: string,
  initial: T,
  options?: { restore?: boolean; persist?: boolean }
) {
  const restore = options?.restore ?? true;
  const persist = options?.persist ?? true;

  const [state, setState] = useState<T>(initial);
  const [ready, setReady] = useState(!restore);

  // Restore after mount (only when asked to) → avoids the hydration mismatch.
  useEffect(() => {
  if (!restore) return;

  try {
    const raw = localStorage.getItem(key);

    if (raw !== null) {
      const saved = JSON.parse(raw);

      if (
        typeof initial === "object" &&
        initial !== null &&
        !Array.isArray(initial)
      ) {
        setState({
          ...(initial as object),
          ...(saved as object),
        } as T);
      } else {
        setState(saved as T);
      }
    }
  } catch {}

  setReady(true);
}, [key, restore, initial]);

  useEffect(() => {
    if (!persist || !ready) return;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, persist, ready, state]);

  const clear = () => { try { localStorage.removeItem(key); } catch {} };
  return [state, setState, clear] as const;
}