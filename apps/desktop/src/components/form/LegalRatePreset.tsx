import { loadLegalRates, rateHistoryFor } from "@lawcalc-kr/core-engine";

import { Select } from "../ui/select";
import { Input } from "../ui/input";

export type LegalRatePresetOption = "civil" | "commercial" | "promotion" | "custom";

interface LegalRatePresetProps {
  value: LegalRatePresetOption;
  customRate: number;
  error?: string;
  /** 계산 기간. 소촉법 이율 변경일을 걸칠 때만 부칙 경과조치 안내를 띄우는 데 쓴다. */
  startDate?: string;
  endDate?: string;
  onValueChange: (value: LegalRatePresetOption) => void;
  onCustomRateChange: (value: number) => void;
}

/**
 * 소촉법 이율 변경일 (최초 시행일 2003-06-01 제외 — 그건 위헌결정 안내가 이미 덮는다).
 * 하드코딩하지 않고 dataset 이력에서 뽑아, 나중에 이율이 또 바뀌어도 안내가 따라간다.
 */
const promotionRateChangeDates: readonly string[] = rateHistoryFor(loadLegalRates(), "promotion")
  .map((h) => h.from)
  .slice(1);

/**
 * 계산 기간이 소촉법 이율 변경일을 걸치는가.
 *
 * 걸칠 때만 부칙 경과조치를 안내한다. 대통령령 제26553호 부칙 제2조 ①항과 제29768호 부칙
 * 제2조 ①항이 똑같이 "이 영 시행 당시 법원에 계속 중인 사건으로서 제1심의 변론이 종결된
 * 사건에 대한 법정이율은 … 종전의 규정에 따른다" 고 정한다. 변론종결일은 입력에 없어 자동
 * 판정이 불가능하므로 계산은 그대로 두고 안내만 한다.
 */
export function straddlesPromotionRateChange(startDate?: string, endDate?: string): boolean {
  if (!startDate || !endDate || startDate >= endDate) {
    return false;
  }
  return promotionRateChangeDates.some((date) => startDate < date && date <= endDate);
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
  startDate,
  endDate,
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
          {straddlesPromotionRateChange(startDate, endDate) ? (
            <>
              {" "}
              이 계산 기간은 이율 변경일을 걸칩니다. 변경일 전에 제1심 변론이 종결된 사건은 부칙
              경과조치에 따라 종전 이율이 계속 적용될 수 있으니, 판결문의 이율 표기를 확인하세요.
            </>
          ) : null}
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
        </label>
      ) : null}
      {/* 에러 표시를 "직접 입력" 분기 밖에 둔다. 프리셋이 계산 기간을 못 덮는다는 안내는
          custom 이 아닐 때만 나오므로, 분기 안에 있으면 영영 화면에 뜨지 않는다. */}
      {error ? (
        <span id={errorId} className="text-xs font-normal text-red-600" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
