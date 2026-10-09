"use client";

import { useCallback, useState } from "react";

// Open/close state for a dialog about one record. The record stays set after closing, so the
// dialog's text doesn't change while its exit animation plays.
export function useDialog<T>() {
  const [state, setState] = useState<{ open: boolean; target: T | null }>({ open: false, target: null });
  const show = useCallback((target: T | null = null) => setState({ open: true, target }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { open: state.open, target: state.target, show, close };
}
