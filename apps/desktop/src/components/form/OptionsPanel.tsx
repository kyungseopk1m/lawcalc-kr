import type { CalcOptions } from "@lawcalc-kr/core-engine";

import { cn } from "../../lib/utils";

interface OptionsPanelProps {
  value: CalcOptions;
  onChange: (value: CalcOptions) => void;
}

function RadioOption({
  checked,
  id,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  name: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-10 items-center gap-1.5 rounded-md border border-input px-2.5 py-2 text-sm",
        checked
          ? "border-primary bg-primary/5 font-medium text-primary"
          : "bg-background hover:bg-muted/40",
      )}
    >
      <input id={id} checked={checked} name={name} type="radio" onChange={onChange} />
      {label}
    </label>
  );
}

export function OptionsPanel({ value, onChange }: OptionsPanelProps) {
  return (
    <div className="grid gap-4 rounded-md border border-border bg-muted/40 p-3">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">계산 방식</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioOption
            checked={value.mode === "period"}
            id="mode-period"
            label="기간식"
            name="mode"
            onChange={() => onChange({ ...value, mode: "period" })}
          />
          <RadioOption
            checked={value.mode === "totalDays"}
            id="mode-total-days"
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
            id="leap-year-fixed-365"
            label="고정 365일"
            name="leapYear"
            onChange={() => onChange({ ...value, leapYear: "fixed365" })}
          />
          <RadioOption
            checked={value.leapYear === "actual"}
            id="leap-year-actual"
            label="실제 일수(윤년 366)"
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
            id="include-first-day"
            label="초일 산입"
            name="includeFirstDay"
            onChange={() => onChange({ ...value, includeFirstDay: true })}
          />
          <RadioOption
            checked={!value.includeFirstDay}
            id="exclude-first-day"
            label="초일 불산입"
            name="includeFirstDay"
            onChange={() => onChange({ ...value, includeFirstDay: false })}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">끝수 처리</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <RadioOption
            checked={(value.rounding ?? "floor") === "floor"}
            id="rounding-floor"
            label="절사"
            name="rounding"
            onChange={() => onChange({ ...value, rounding: "floor" })}
          />
          <RadioOption
            checked={value.rounding === "ceil"}
            id="rounding-ceil"
            label="절상"
            name="rounding"
            onChange={() => onChange({ ...value, rounding: "ceil" })}
          />
          <RadioOption
            checked={value.rounding === "round"}
            id="rounding-round"
            label="반올림"
            name="rounding"
            onChange={() => onChange({ ...value, rounding: "round" })}
          />
        </div>
      </fieldset>
    </div>
  );
}
