import { useEffect, useState } from "react";

import {
  RESET_CONFIRM_MS,
  RESET_DONE_EVENT,
  RESET_PENDING_EVENT,
} from "../../hooks/use-form-shortcuts";

/** Esc 를 한 번 눌렀을 때 "한 번 더 누르면 초기화" 를 잠깐 띄운다. */
export function ResetHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      clearTimeout(timer);
      setVisible(true);
      timer = setTimeout(() => setVisible(false), RESET_CONFIRM_MS);
    };
    const hide = () => {
      clearTimeout(timer);
      setVisible(false);
    };
    window.addEventListener(RESET_PENDING_EVENT, show);
    window.addEventListener(RESET_DONE_EVENT, hide);
    return () => {
      window.removeEventListener(RESET_PENDING_EVENT, show);
      window.removeEventListener(RESET_DONE_EVENT, hide);
      clearTimeout(timer);
    };
  }, []);
  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-background px-4 py-2 text-sm shadow-md"
    >
      Esc 를 한 번 더 누르면 입력을 모두 초기화합니다.
    </div>
  );
}
