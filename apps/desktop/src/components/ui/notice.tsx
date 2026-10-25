import type { ReactNode } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";

import { cn } from "../../lib/utils";

/**
 * 화면 안내 상자. 색은 세 가지만 쓴다.
 * - `error`: 계산이 안 되거나 입력이 틀렸을 때
 * - `warn`: 결과가 틀릴 수 있고 사용자가 확인하거나 고칠 수 있을 때
 * - `info`: 알아 두면 좋은 정보(상자 없이 보조 글씨)
 */
export type NoticeTone = "error" | "warn" | "info";

const TONES = {
  error: {
    className:
      "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
    Icon: XCircle,
    role: "alert",
  },
  warn: {
    className:
      "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    Icon: AlertTriangle,
    role: "status",
  },
  info: {
    className: "text-xs text-muted-foreground",
    Icon: Info,
    role: undefined,
  },
} as const;

export function Notice({
  tone,
  children,
  className,
  testId,
}: {
  tone: NoticeTone;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { className: toneClass, Icon, role } = TONES[tone];
  return (
    <div
      className={cn("flex items-start gap-2", toneClass, className)}
      role={role}
      data-tone={tone}
      data-testid={testId}
    >
      <Icon
        className={cn("shrink-0", tone === "info" ? "mt-px h-3.5 w-3.5" : "mt-0.5 h-4 w-4")}
        aria-hidden="true"
      />
      <div className="grid min-w-0 gap-1">{children}</div>
    </div>
  );
}
