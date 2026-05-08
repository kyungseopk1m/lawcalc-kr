import type { CalcOptions } from "@lawcalc-kr/core-engine";

import { cn } from "../../lib/utils";

interface OptionsPanelProps {
  value: CalcOptions;
  onChange: (value: CalcOptions) => void;
}

function RadioOption({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-md border border-input px-3 py-2 text-sm",
        checked ? "border-primary bg-secondary text-secondary-foreground" : "bg-background",
      )}
    >
      <input checked={checked} name={name} type="radio" onChange={onChange} />
      {label}
    </label>
  );
}

export function OptionsPanel({ value, onChange }: OptionsPanelProps) {
  return (
    <div className="grid gap-4 rounded-md border border-border bg-muted/40 p-4">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">계산 방식</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioOption
            checked={value.mode === "period"}
            label="기간식"
            name="mode"
            onChange={() => onChange({ ...value, mode: "period" })}
          />
          <RadioOption
            checked={value.mode === "totalDays"}
            label="총일수식"
            name="mode"
            onChange={() => onChange({ ...value, mode: "totalDays" })}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">윤년 처리</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioOption
            checked={value.leapYear === "fixed365"}
            label="평년 365일 고정"
            name="leapYear"
            onChange={() => onChange({ ...value, leapYear: "fixed365" })}
          />
          <RadioOption
            checked={value.leapYear === "actual"}
            label="윤년 366일 반영"
            name="leapYear"
            onChange={() => onChange({ ...value, leapYear: "actual" })}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">초일 처리</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioOption
            checked={value.includeFirstDay}
            label="초일 산입"
            name="includeFirstDay"
            onChange={() => onChange({ ...value, includeFirstDay: true })}
          />
          <RadioOption
            checked={!value.includeFirstDay}
            label="초일 불산입"
            name="includeFirstDay"
            onChange={() => onChange({ ...value, includeFirstDay: false })}
          />
        </div>
      </fieldset>
    </div>
  );
}
