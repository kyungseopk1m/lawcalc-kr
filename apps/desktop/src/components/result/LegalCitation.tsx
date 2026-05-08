import type { LegalRatePresetOption } from "../form/LegalRatePreset";

interface LegalCitationProps {
  preset: LegalRatePresetOption;
  dataVersion: string;
}

const citations: Record<LegalRatePresetOption, string> = {
  civil: "민법 제379조 법정이율",
  commercial: "상법 제54조 상사 법정이율",
  promotion: "소송촉진 등에 관한 특례법 제3조 지연손해금 이율",
  custom: "사용자 직접 입력 이율",
};

export function LegalCitation({ preset, dataVersion }: LegalCitationProps) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6">
      <p className="font-medium">적용 근거</p>
      <p className="text-muted-foreground">
        {citations[preset]} · 데이터 버전 {dataVersion}
      </p>
    </div>
  );
}
