import { Download, RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";

import type { UpdaterApi, UpdaterState } from "../hooks/useUpdater";
import { useHasUnsavedLcalcChanges } from "../lib/lcalc-dirty-state";
import { Button } from "./ui/button";

/**
 * 인앱 업데이트 dialog. hop 패턴 5 단계 state machine 기반.
 *
 * - `idle`: 렌더링 안 함.
 * - `available`: "지금 업데이트" / "나중에" 선택.
 * - `downloading`: progress bar (받은 / 전체 byte).
 * - `ready`: `.lcalc` 미저장 변경이 없을 때만 재시작 허용.
 * - `error`: 한국어 메시지 + "다시 시도" / "닫기".
 */
export function UpdateDialog({ api }: { api: UpdaterApi }): ReactNode {
  const { state, confirmInstall, dismiss, relaunch, retry } = api;
  const hasUnsavedLcalcChanges = useHasUnsavedLcalcChanges();
  if (state.status === "idle") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center sm:p-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-black/40"
        onClick={state.status === "downloading" ? undefined : dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <UpdateDialogBody
          state={state}
          onConfirm={confirmInstall}
          onDismiss={dismiss}
          onRelaunch={relaunch}
          onRetry={retry}
          hasUnsavedLcalcChanges={hasUnsavedLcalcChanges}
        />
      </div>
    </div>
  );
}

interface BodyProps {
  state: Exclude<UpdaterState, { status: "idle" }>;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
  onRelaunch: () => Promise<void>;
  onRetry: () => Promise<void>;
  hasUnsavedLcalcChanges: boolean;
}

function UpdateDialogBody(props: BodyProps): ReactNode {
  const { state } = props;
  switch (state.status) {
    case "available":
      return <AvailableBody {...props} state={state} />;
    case "downloading":
      return <DownloadingBody state={state} />;
    case "ready":
      return (
        <ReadyBody
          hasUnsavedLcalcChanges={props.hasUnsavedLcalcChanges}
          onRelaunch={props.onRelaunch}
          onDismiss={props.onDismiss}
        />
      );
    case "error":
      return <ErrorBody state={state} onRetry={props.onRetry} onDismiss={props.onDismiss} />;
  }
}

function AvailableBody({
  state,
  onConfirm,
  onDismiss,
}: BodyProps & { state: Extract<UpdaterState, { status: "available" }> }): ReactNode {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 id="update-dialog-title" className="text-lg font-semibold">
          새 버전이 준비됐습니다
        </h2>
        <button
          type="button"
          aria-label="나중에"
          onClick={onDismiss}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        LawCalc Korea v{state.version} 가 사용 가능합니다.
      </p>
      {state.notes ? (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {state.notes}
        </pre>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDismiss}>
          나중에
        </Button>
        <Button
          onClick={() => {
            void onConfirm();
          }}
        >
          <Download className="mr-1.5 h-4 w-4" />
          지금 업데이트
        </Button>
      </div>
    </>
  );
}

function DownloadingBody({
  state,
}: {
  state: Extract<UpdaterState, { status: "downloading" }>;
}): ReactNode {
  const pct = state.contentLength
    ? Math.min(100, Math.round((state.downloaded / state.contentLength) * 100))
    : null;
  return (
    <>
      <h2 id="update-dialog-title" className="text-lg font-semibold">
        업데이트 다운로드 중…
      </h2>
      <div className="mt-4 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: pct === null ? "100%" : `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        {pct === null
          ? `${formatBytes(state.downloaded)} 받음`
          : `${formatBytes(state.downloaded)} / ${formatBytes(state.contentLength ?? 0)} (${pct}%)`}
      </p>
    </>
  );
}

function ReadyBody({
  hasUnsavedLcalcChanges,
  onRelaunch,
  onDismiss,
}: {
  hasUnsavedLcalcChanges: boolean;
  onRelaunch: () => Promise<void>;
  onDismiss: () => void;
}): ReactNode {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 id="update-dialog-title" className="text-lg font-semibold">
          업데이트 준비 완료
        </h2>
        <button
          type="button"
          aria-label="나중에 재시작"
          onClick={onDismiss}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        설치를 적용하려면 앱을 재시작해야 합니다.
      </p>
      {hasUnsavedLcalcChanges ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          저장하지 않은 .lcalc 변경사항이 있습니다. 먼저 저장한 뒤 재시작해 주세요.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDismiss}>
          나중에 재시작
        </Button>
        <Button
          disabled={hasUnsavedLcalcChanges}
          onClick={() => {
            void onRelaunch();
          }}
        >
          지금 재시작
        </Button>
      </div>
    </>
  );
}

function ErrorBody({
  state,
  onRetry,
  onDismiss,
}: {
  state: Extract<UpdaterState, { status: "error" }>;
  onRetry: () => Promise<void>;
  onDismiss: () => void;
}): ReactNode {
  return (
    <>
      <h2 id="update-dialog-title" className="text-lg font-semibold text-red-600 dark:text-red-400">
        업데이트 오류
      </h2>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        {state.previous === "checking"
          ? "업데이트 확인 중 문제가 발생했습니다."
          : "다운로드 중 문제가 발생했습니다."}
      </p>
      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
        {state.message}
      </pre>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onDismiss}>
          닫기
        </Button>
        <Button
          onClick={() => {
            void onRetry();
          }}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          다시 시도
        </Button>
      </div>
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
