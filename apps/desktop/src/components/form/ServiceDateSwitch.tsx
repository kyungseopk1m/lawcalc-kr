import { useState } from "react";

import { serviceSwitchSegments, type RateSegment } from "@lawcalc-kr/core-engine";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { legalRateOptions, type LegalRatePresetOption } from "./LegalRatePreset";

interface ServiceDateSwitchProps {
  preset: LegalRatePresetOption;
  customRate: number;
  startDate: string;
  endDate: string;
  onApply: (segments: RateSegment[]) => void;
}

/** 엔진 오류를 원인별 안내로 바꾼다. 알 수 없는 오류는 원문을 덧붙인다. */
function serviceSwitchErrorMessage(err: unknown, preset: LegalRatePresetOption): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/Invalid (ISO|calendar) date/.test(message)) {
    return "송달일 또는 계산 기간 날짜 형식이 올바르지 않습니다.";
  }
  if (message.includes('legalRatePreset "promotion"')) {
    return "소송촉진법 이율은 2003-06-01부터 적용됩니다. 송달일 다음 날이 그 전이면 구간을 채울 수 없습니다.";
  }
  if (message.includes("customRate")) {
    return "직접 입력한 이율을 확인해 주세요.";
  }
  if (message.includes("legalRatePreset")) {
    return `선택한 프리셋(${legalRateOptions[preset].label}) 이율 데이터가 송달일까지의 기간을 다 덮지 않습니다. 기간 시작일을 확인해 주세요.`;
  }
  return `구간을 채우지 못했습니다: ${message}`;
}

/**
 * 소장 송달일 다음 날부터 소송촉진법 이율로 바꾸는 이율 구간을 채운다 (소송촉진법 제3조 제1항).
 * 결과는 일반 이율 구간이라 저장 파일 모양이 바뀌지 않는다.
 */
export function ServiceDateSwitch({
  preset,
  customRate,
  startDate,
  endDate,
  onApply,
}: ServiceDateSwitchProps) {
  const [serviceDate, setServiceDate] = useState("");
  const [error, setError] = useState("");
  const disabled = preset === "promotion" || !serviceDate || !startDate || endDate < startDate;

  const apply = () => {
    if (preset === "promotion") return;
    try {
      onApply(
        serviceSwitchSegments({
          startDate,
          endDate,
          serviceDate,
          basePreset: preset === "custom" ? { customRate } : preset,
        }),
      );
      setError("");
    } catch (err) {
      setError(serviceSwitchErrorMessage(err, preset));
    }
  };

  return (
    <div className="grid gap-2 rounded-md border border-border p-3">
      <label className="grid gap-1 text-sm font-medium">
        소장 송달일 (송달일 전환)
        <div className="flex gap-2">
          <Input
            type="date"
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
          />
          <Button type="button" variant="outline" disabled={disabled} onClick={apply}>
            구간 채우기
          </Button>
        </div>
      </label>
      <p className="text-xs leading-5 text-muted-foreground">
        송달일까지는 위 프리셋 이율, 다음 날부터는 소송촉진 등에 관한 특례법 이율로 이율 구간을
        채웁니다(같은 법 제3조 제1항). 채무자의 항쟁이 타당한 범위(제3조 제2항)가 있으면 송달일 대신
        그 범위가 끝나는 날(예: 판결 선고일)을 넣으세요. 장래의 이행을 청구하는 소(민사소송법
        제251조)는 같은 항 단서에 따라 소송촉진법 이율을 적용하지 않으니 이 기능을 쓰지 마세요.
      </p>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
