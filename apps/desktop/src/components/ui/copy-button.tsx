import { Clipboard } from "lucide-react";
import { useState } from "react";

import { ipc } from "../../lib/ipc";
import { Button } from "./button";

// 상태 문구는 입력이 바뀌면 지워야 한다. 부르는 쪽이 입력에서 key 를 만들어 넘긴다.
export function CopyButton({
  getText,
  okMessage = "결과를 클립보드에 복사했습니다.",
}: {
  getText: () => string;
  okMessage?: string;
}) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleCopy = async () => {
    try {
      await ipc.copyToClipboard(getText());
      setStatus({ ok: true, message: okMessage });
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void handleCopy();
        }}
      >
        <Clipboard className="h-4 w-4" aria-hidden="true" />
        복사
      </Button>
      {status ? (
        <span
          role="status"
          className={`text-xs ${status.ok ? "text-muted-foreground" : "text-red-700 dark:text-red-200"}`}
        >
          {status.message}
        </span>
      ) : null}
    </>
  );
}
