import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "../ui/button";

interface InfoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InfoDialog({ open, onClose }: InfoDialogProps) {
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
        className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl"
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
          <section aria-labelledby="info-disclaimer">
            <h3 id="info-disclaimer" className="mb-1 font-medium">
              면책 고지
            </h3>
            <p className="text-muted-foreground">
              이 도구의 계산 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.
              lawcalc-kr는 법원 공식 프로그램과 무관합니다.
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
            <p className="text-muted-foreground">v0.1.2</p>
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
