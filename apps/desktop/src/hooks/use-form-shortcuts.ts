import { useEffect, useRef } from "react";

export interface FormShortcuts {
  onSave?: () => void;
  onCalculate?: () => void;
  onReset?: () => void;
  enabled?: boolean;
}

/** 첫 Esc 직후 화면 안내(ResetHint)가 듣는 이벤트. */
export const RESET_PENDING_EVENT = "lawcalc:reset-pending";
/** 두 번째 Esc 로 초기화한 직후. 안내가 남아 있으면 바로 내린다. */
export const RESET_DONE_EVENT = "lawcalc:reset-done";
export const RESET_CONFIRM_MS = 2000;

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
  const lastEscAt = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape" && onReset) {
        if (isFormFieldTarget(event.target)) return;
        event.preventDefault();
        // 입력 전체가 사라지므로 2초 안에 한 번 더 눌러야 초기화한다.
        const now = Date.now();
        if (now - lastEscAt.current <= RESET_CONFIRM_MS) {
          lastEscAt.current = 0;
          onReset();
          window.dispatchEvent(new Event(RESET_DONE_EVENT));
        } else {
          lastEscAt.current = now;
          window.dispatchEvent(new Event(RESET_PENDING_EVENT));
        }
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
