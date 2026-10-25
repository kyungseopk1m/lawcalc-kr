import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * 긴 설명을 접어 두는 보조 글씨. 접힌 상태에서도 근거(조문·판례 번호)는 `cite` 로 보인다.
 * 설명 문구는 펼치면 그대로 나온다.
 */
export function HelpText({
  cite,
  children,
  className,
}: {
  cite?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("text-xs font-normal text-muted-foreground", className)}>
      <summary className="cursor-pointer select-none hover:text-foreground">
        설명 보기
        {cite ? <span className="ml-1">· {cite}</span> : null}
      </summary>
      <div className="mt-1 leading-5">{children}</div>
    </details>
  );
}
