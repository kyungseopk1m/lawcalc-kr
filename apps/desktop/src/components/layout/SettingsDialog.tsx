import { Monitor, Moon, Settings, Sun, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { useTheme, type ThemePreference } from "../../contexts/ThemeContext";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "system",
    label: "시스템",
    description: "macOS 또는 Windows 설정을 따릅니다.",
    icon: Monitor,
  },
  {
    value: "light",
    label: "라이트",
    description: "밝은 배경으로 고정합니다.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "다크",
    description: "어두운 배경으로 고정합니다.",
    icon: Moon,
  },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="settings-dialog-title" className="text-base font-semibold">
              설정
            </h2>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5 text-sm">
          <section aria-labelledby="settings-theme">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h3 id="settings-theme" className="font-medium">
                  화면 모드
                </h3>
                <p className="mt-1 text-muted-foreground">
                  현재 적용: {resolvedTheme === "dark" ? "다크" : "라이트"}
                </p>
              </div>
            </div>

            <div
              className="grid gap-2 sm:grid-cols-3"
              role="radiogroup"
              aria-labelledby="settings-theme"
            >
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const selected = theme === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "flex min-h-24 flex-col items-start gap-2 rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {option.label}
                    </span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-border px-6 py-4">
          <Button type="button" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
