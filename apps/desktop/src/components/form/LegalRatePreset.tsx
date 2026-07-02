import { Select } from "../ui/select";
import { Input } from "../ui/input";

export type LegalRatePresetOption = "civil" | "commercial" | "promotion" | "custom";

interface LegalRatePresetProps {
  value: LegalRatePresetOption;
  customRate: number;
  error?: string;
  onValueChange: (value: LegalRatePresetOption) => void;
  onCustomRateChange: (value: number) => void;
}

export const legalRateOptions: Record<LegalRatePresetOption, { label: string; rate: number }> = {
  civil: { label: "민법 5%", rate: 0.05 },
  commercial: { label: "상법 6%", rate: 0.06 },
  promotion: { label: "소촉법 12%", rate: 0.12 },
  custom: { label: "직접 입력", rate: 0 },
};

export function LegalRatePreset({
  value,
  customRate,
  error,
  onValueChange,
  onCustomRateChange,
}: LegalRatePresetProps) {
  const errorId = "custom-rate-error";

  return (
    <div className="grid gap-2">
      <label className="grid gap-2 text-sm font-medium">
        법정이율 프리셋
        <Select
          value={value}
          onChange={(event) => onValueChange(event.target.value as LegalRatePresetOption)}
        >
          <option value="civil">민법 5%</option>
          <option value="commercial">상법 6%</option>
          <option value="promotion">소촉법 12%</option>
          <option value="custom">직접 입력</option>
        </Select>
      </label>
      {value === "promotion" ? (
        <span className="text-xs font-normal text-muted-foreground">
          소촉법 이율은 2003-06-01부터 적용됩니다. 그 이전 기간은 위헌결정(헌재 2003. 4. 24.
          2002헌가15)에 따라 민법·상법 법정이율로 계산하고, 위헌결정 전 확정판결의 연 25%는 판결문
          기재 이율을 직접 입력하세요.
        </span>
      ) : null}
      {value === "custom" ? (
        <label className="grid gap-2 text-sm font-medium">
          직접 입력 이율 (%)
          <Input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            inputMode="decimal"
            min="0"
            placeholder="예: 7.5"
            step="0.1"
            type="number"
            value={customRate > 0 ? customRate * 100 : ""}
            onChange={(event) => onCustomRateChange(Number(event.target.value) / 100)}
          />
          {error ? (
            <span id={errorId} className="text-xs font-normal text-red-600">
              {error}
            </span>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}
