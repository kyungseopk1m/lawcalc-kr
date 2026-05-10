import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { open as openExternal } from "@tauri-apps/plugin-shell";

import { Button } from "../ui/button";

const REPO_URL = "https://github.com/kyungseopk1m/lawcalc-kr";
const ISSUES_URL = `${REPO_URL}/issues`;
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function handleExternal(url: string) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openExternal(url);
  };
}

interface InfoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InfoDialog({ open, onClose }: InfoDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab" && dialogRef.current) {
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
        className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="info-dialog-title" className="text-base font-semibold">
            정보
          </h2>
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

        <div className="space-y-4 px-6 py-5 text-sm">
          <section aria-labelledby="info-intro">
            <h3 id="info-intro" className="mb-1 font-medium">
              소개
            </h3>
            <p className="text-muted-foreground">
              본질에 집중한 법률 계산 워크벤치. 불필요한 장식을 덜어내고 계산의 본질을 상징하는
              모노그램과 단 하나의 기준선으로 신뢰감과 전문성을 표현했습니다.
            </p>
          </section>

          <section aria-labelledby="info-disclaimer">
            <h3 id="info-disclaimer" className="mb-1 font-medium">
              면책 고지
            </h3>
            <p className="text-muted-foreground">
              {STANDARD_DISCLAIMER} lawcalc-kr는 법원 공식 프로그램과 무관합니다.
            </p>
          </section>

          <section aria-labelledby="info-license">
            <h3 id="info-license" className="mb-1 font-medium">
              라이선스
            </h3>
            <p className="text-muted-foreground">
              GNU Affero General Public License v3.0 (이상). 자세한 내용은 LICENSE 파일을
              참조하세요.
            </p>
          </section>

          <section aria-labelledby="info-resources">
            <h3 id="info-resources" className="mb-1 font-medium">
              리소스
            </h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>
                GitHub 저장소:{" "}
                <a
                  href={REPO_URL}
                  onClick={handleExternal(REPO_URL)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  github.com/kyungseopk1m/lawcalc-kr
                </a>
              </li>
              <li>
                버그·기능 제안:{" "}
                <a
                  href={ISSUES_URL}
                  onClick={handleExternal(ISSUES_URL)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Issues
                </a>
              </li>
              <li>
                라이선스 본문:{" "}
                <a
                  href={LICENSE_URL}
                  onClick={handleExternal(LICENSE_URL)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  LICENSE
                </a>
              </li>
            </ul>
          </section>

          <section aria-labelledby="info-shortcuts">
            <h3 id="info-shortcuts" className="mb-1 font-medium">
              단축키
            </h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>Cmd/Ctrl+S: .lcalc 저장</li>
              <li>Cmd/Ctrl+Enter: 계산</li>
              <li>Esc: 입력 필드 밖에서 초기화</li>
            </ul>
          </section>

          <section aria-labelledby="info-version">
            <h3 id="info-version" className="mb-1 font-medium">
              버전
            </h3>
            <p className="text-muted-foreground">v0.2.5</p>
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
