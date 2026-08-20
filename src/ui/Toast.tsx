"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useGame } from "@/lib/store";

/**
 * Transient messages: easter-egg discoveries, tips, developer facts.
 * Announced politely to screen readers, dismissed on a timer proportional
 * to how much there is to read.
 */

const ICON = { info: "✈", reward: "★", system: "⌘" } as const;

export function Toast() {
  const toast = useGame((s) => s.toast);
  const clear = useGame((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const ms = Math.min(9000, 3200 + toast.text.length * 42);
    const t = setTimeout(clear, ms);
    return () => clearTimeout(t);
  }, [toast, clear]);

  return (
    <div aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            data-tone={toast.tone}
            initial={{ opacity: 0, y: -22, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <span className="toast__icon" aria-hidden="true">
              {ICON[toast.tone]}
            </span>
            <span>{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
