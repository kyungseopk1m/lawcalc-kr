import type { KeyboardEvent } from "react";

import { cn } from "../../lib/utils";

/**
 * 탭 줄. 모양은 두 단계만 쓴다.
 * - `line`: 상단 탭. 선택한 탭에 밑줄만 긋는다.
 * - `segmented`: 하위 탭. 회색 바탕 안에서 선택한 탭만 흰 칸으로 띄운다.
 *
 * WAI-ARIA 탭 패턴을 따른다. 탭 순서에는 선택한 탭 하나만 두고(roving tabindex),
 * 좌우 화살표와 Home/End 로 옮기면서 바로 선택한다.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant,
  idPrefix,
  panelPrefix,
  label,
  className,
}: {
  items: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  variant: "line" | "segmented";
  /** 탭 버튼 id 는 `${idPrefix}-${id}`, 패널 id 는 `${panelPrefix}-${id}` 다. */
  idPrefix: string;
  panelPrefix: string;
  label?: string;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.id === value);
    const next = (
      { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 } as Record<
        string,
        number
      >
    )[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const item = items[(next + items.length) % items.length]!;
    onChange(item.id);
    document.getElementById(`${idPrefix}-${item.id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "flex flex-wrap",
        variant === "line" ? "gap-1" : "w-fit gap-1 rounded-md bg-muted p-1",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            id={`${idPrefix}-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${panelPrefix}-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              variant === "line"
                ? cn(
                    "-mb-px h-11 border-b-2 px-3",
                    selected
                      ? "border-primary font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                : cn(
                    "h-8 rounded px-3",
                    selected
                      ? "bg-background font-semibold text-foreground shadow-sm dark:bg-input"
                      : "text-muted-foreground hover:text-foreground",
                  ),
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
