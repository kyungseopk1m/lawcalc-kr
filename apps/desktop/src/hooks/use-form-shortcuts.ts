import { useEffect } from "react";

export interface FormShortcuts {
  onSave?: () => void;
  onCalculate?: () => void;
  onReset?: () => void;
  enabled?: boolean;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useFormShortcuts({
  onSave,
  onCalculate,
  onReset,
  enabled = true,
}: FormShortcuts): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape" && onReset) {
        if (isFormFieldTarget(event.target)) return;
        event.preventDefault();
        onReset();
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onCalculate) {
        event.preventDefault();
        onCalculate();
        return;
      }

      if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey) && onSave) {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onSave, onCalculate, onReset, enabled]);
}
