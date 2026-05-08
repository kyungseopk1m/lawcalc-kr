import { Scale } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-normal text-foreground">
              LawCalc Korea
            </h1>
            <p className="text-sm text-muted-foreground">법률 계산 워크벤치</p>
          </div>
        </div>
      </div>
    </header>
  );
}
