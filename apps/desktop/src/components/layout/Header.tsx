import { Info, Settings } from "lucide-react";
import { useState } from "react";

import lcMark from "../../assets/brand/lc-mark.png";
import { Button } from "../ui/button";
import { InfoDialog } from "./InfoDialog";
import { SettingsDialog } from "./SettingsDialog";

export function Header() {
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={lcMark} alt="LawCalc Korea" width={36} height={36} className="rounded-md" />
            <div>
              <h1 className="text-base font-semibold tracking-normal text-foreground">
                LawCalc Korea
              </h1>
              <p className="text-sm text-muted-foreground">법률 계산 워크벤치</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
              title="설정"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInfoOpen(true)}
              className="gap-1.5"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
              정보
            </Button>
          </div>
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <InfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}
