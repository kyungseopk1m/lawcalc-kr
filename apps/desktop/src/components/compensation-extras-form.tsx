/**
 * 손해배상 추가 섹션 화면 (기대여명·일실퇴직금·중복장해율·원고별 귀속·지연손해금). 부상·사망 공용.
 * 상태 변환과 문구는 `lib/compensation-extras.ts` 에 있다.
 */

import { Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";

import {
  combineDisabilityRatesPercent,
  computeLifeExpectancy,
  computeLostRetirement,
  type CompensationAutoDeathResult,
  type CompensationResult,
  type LifeExpectancyResult,
  type LostRetirementResult,
} from "@lawcalc-kr/compensation";

import {
  buildLifeExpectancyInput,
  buildLostRetirementInput,
  CLAIMANT_ROUNDING_LABELS,
  emptyFamilyClaimant,
  orphanedOwnSolatium,
  injuryClaimantLabel,
  LIFE_TABLE_YEARS,
  lifeExpectancyText,
  LOSS_RATE_PERCENT_FORMAT,
  LOST_RETIREMENT_METHOD_LABELS,
  lostRetirementDetailRows,
  shorteningFormatOf,
  type ClaimantRounding,
  type DeathClaimantsFormState,
  type DelayDamagesExport,
  type DelayDamagesFormState,
  type FamilyClaimantRow,
  type InjuryClaimantsFormState,
  type LifeExpectancyFormState,
  type LostRetirementFormState,
  type ShorteningMethod,
  DOCUMENT_FORMAT_LABELS,
  type DocumentExport,
  type DocumentFormat,
  type DocumentFormState,
} from "../lib/compensation-extras";
import { formatWon, formatWonInput, parseWonText } from "../lib/format-won";
import { FieldError, parseNumberText } from "../lib/parse-number";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

function SectionCard({
  title,
  hint,
  enabled,
  toggleLabel,
  onToggle,
  children,
  testId,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  toggleLabel: string;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          {toggleLabel}
        </label>
        {enabled ? children : null}
      </CardContent>
    </Card>
  );
}

/** (라벨, 값) 행 목록. 부모가 `grid-cols-2` 다. */
function PairRows({ rows }: { rows: [string, string][] }) {
  return (
    <>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span className="text-muted-foreground">{label}</span>
          <span className="text-right">{value}</span>
        </Fragment>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ 기대여명 */

function lifeExpectancyRows(r: LifeExpectancyResult): [string, string][] {
  const rows: [string, string][] = [
    ["기준일 · 만 나이", `${r.baseDate} · 만 ${r.age}세`],
    ["사용 생명표", `${r.tableYear}년`],
    ["기대여명", `${r.remainingYears}년`],
    ["정상 여명종료일", r.normalEndDate],
  ];
  if (r.shortenedEndDate !== undefined) {
    rows.push(["단축 여명종료일", `${r.shortenedEndDate} (${r.shortenedRemainingYears}년)`]);
  }
  rows.push(["최종 여명종료일", `${r.endDate}${r.endDateOverridden ? " (직접 지정)" : ""}`]);
  return rows;
}

/** 지금 입력으로 계산한 기대여명. 입력이 모자라면 오류 문구. */
export function previewLifeExpectancy(
  value: LifeExpectancyFormState,
  base: { sex: "male" | "female"; birthDate: string; accidentDate: string },
): { result?: LifeExpectancyResult; error?: string } {
  if (!value.enabled) return {};
  try {
    const input = buildLifeExpectancyInput(value);
    return { result: computeLifeExpectancy({ ...input, ...base }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function LifeExpectancyCard({
  value,
  onChange,
  preview,
  mode,
}: {
  value: LifeExpectancyFormState;
  onChange: (value: LifeExpectancyFormState) => void;
  preview: { result?: LifeExpectancyResult; error?: string };
  mode: "injury" | "death";
}) {
  const patch = (next: Partial<LifeExpectancyFormState>) => onChange({ ...value, ...next });
  const format = shorteningFormatOf(value.shorteningMethod);
  return (
    <SectionCard
      title="기대여명"
      hint={
        mode === "injury"
          ? "통계청 생명표의 기대여명으로 여명종료일을 구합니다. 여명종료일이 가동종료일보다 앞서면 그 뒤 일실수입에서 생계비 1/3을 공제합니다 (서울고법 2022. 2. 18. 선고 2020나2039267)."
          : "통계청 생명표의 기대여명으로 여명종료일을 구해 결과에 표시합니다. 사망 일실수입 금액은 바뀌지 않습니다."
      }
      enabled={value.enabled}
      toggleLabel="기대여명 반영"
      onToggle={(enabled) => patch({ enabled })}
      testId="compensation-life-expectancy-card"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          기준
          <Select
            value={value.basis}
            onChange={(e) => patch({ basis: e.target.value as LifeExpectancyFormState["basis"] })}
          >
            <option value="accident">사고일</option>
            <option value="appraisal">신체감정일</option>
          </Select>
        </label>
        {value.basis === "appraisal" ? (
          <label className="grid gap-2 text-sm font-medium">
            신체감정일
            <Input
              type="date"
              value={value.appraisalDate}
              onChange={(e) => patch({ appraisalDate: e.target.value })}
            />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          단축 방식
          <Select
            value={value.shorteningMethod}
            onChange={(e) => patch({ shorteningMethod: e.target.value as ShorteningMethod })}
          >
            <option value="none">없음</option>
            <option value="subtractYears">연수 차감</option>
            <option value="remainingYears">남은 여명 연수</option>
            <option value="percent">백분율 (남는 비율)</option>
          </Select>
        </label>
        {value.shorteningMethod !== "none" ? (
          <label className="grid gap-2 text-sm font-medium">
            {value.shorteningMethod === "percent" ? "남는 비율 (%)" : "연수"}
            <Input
              inputMode="decimal"
              aria-label="기대여명 단축 값"
              value={value.shorteningText}
              onChange={(e) => patch({ shorteningText: e.target.value })}
            />
            <FieldError message={parseNumberText(value.shorteningText, format).error} />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm font-medium">
          생명표 연도
          <Select value={value.tableYear} onChange={(e) => patch({ tableYear: e.target.value })}>
            <option value="">자동 (기준일 연도)</option>
            {LIFE_TABLE_YEARS.map((year) => (
              <option key={year} value={String(year)}>
                {year}년
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          여명종료일 직접 지정 (선택)
          <Input
            type="date"
            value={value.endDateOverride}
            onChange={(e) => patch({ endDateOverride: e.target.value })}
          />
        </label>
      </div>
      {preview.error ? <FieldError message={preview.error} /> : null}
      {preview.result ? (
        <div
          className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 text-xs"
          data-testid="compensation-life-expectancy-preview"
        >
          <PairRows rows={lifeExpectancyRows(preview.result)} />
          {preview.result.warnings.map((w) => (
            <span key={w.code} className="col-span-2 text-amber-700 dark:text-amber-300">
              {w.message}
            </span>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

/** 결과 카드 기대여명 행. */
export function LifeExpectancyResultRows({ result }: { result: LifeExpectancyResult }) {
  return (
    <span
      className="col-span-2 text-xs text-muted-foreground"
      data-testid="compensation-life-expectancy-result"
    >
      기대여명: {lifeExpectancyText(result)}
    </span>
  );
}

/* -------------------------------------------------------------- 일실퇴직금 */

function previewLostRetirement(
  value: LostRetirementFormState,
  mode: "injury" | "death",
  accidentDate: string,
): { result?: LostRetirementResult; error?: string } {
  if (!value.enabled) return {};
  try {
    const input = buildLostRetirementInput(value, mode);
    return input ? { result: computeLostRetirement(input, accidentDate) } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function LostRetirementCard({
  value,
  onChange,
  mode,
  accidentDate,
}: {
  value: LostRetirementFormState;
  onChange: (value: LostRetirementFormState) => void;
  mode: "injury" | "death";
  accidentDate: string;
}) {
  const patch = (next: Partial<LostRetirementFormState>) => onChange({ ...value, ...next });
  const preview = previewLostRetirement(value, mode, accidentDate);
  return (
    <SectionCard
      title="일실퇴직금"
      hint={`정년까지 근무했다면 받았을 퇴직금과 이미 받은(받을) 퇴직금의 차이를 사고일 현가로 구해 재산상 손해에 더합니다 (과실상계 전). 현가율은 1 / (1 + 0.05 × 월수/12)를 소수 넷째 자리 아래에서 버린 값입니다.${mode === "death" ? " 사망은 노동능력상실률 100%로 계산합니다." : ""}`}
      enabled={value.enabled}
      toggleLabel="일실퇴직금 포함"
      onToggle={(enabled) => patch({ enabled })}
      testId="compensation-lost-retirement-card"
    >
      <label className="grid gap-2 text-sm font-medium">
        계산 방식
        <Select
          value={value.method}
          onChange={(e) => patch({ method: e.target.value as LostRetirementFormState["method"] })}
        >
          {Object.entries(LOST_RETIREMENT_METHOD_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      {value.method === "direct" ? (
        <label className="grid gap-2 text-sm font-medium">
          일실퇴직금 (원)
          <Input
            inputMode="numeric"
            aria-label="일실퇴직금 직접 입력"
            value={formatWonInput(value.amountText)}
            onChange={(e) => patch({ amountText: parseWonText(e.target.value) })}
          />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            정년예정일 (마지막 근무일)
            <Input
              type="date"
              value={value.retirementDate}
              onChange={(e) => patch({ retirementDate: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            정년퇴직금 (원)
            <Input
              inputMode="numeric"
              aria-label="정년퇴직금"
              value={formatWonInput(value.payAtRetirementText)}
              onChange={(e) => patch({ payAtRetirementText: parseWonText(e.target.value) })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            퇴직일 (사고일 또는 실제 퇴직일)
            <Input
              type="date"
              value={value.separationDate}
              onChange={(e) => patch({ separationDate: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            기수령액 (사고일 기준 퇴직금, 원)
            <Input
              inputMode="numeric"
              aria-label="기수령 퇴직금"
              value={formatWonInput(value.payAtSeparationText)}
              onChange={(e) => patch({ payAtSeparationText: parseWonText(e.target.value) })}
            />
          </label>
          {mode === "injury" ? (
            <label className="grid gap-2 text-sm font-medium">
              노동능력상실률 (%)
              <Input
                inputMode="decimal"
                aria-label="일실퇴직금 노동능력상실률"
                placeholder="예: 43.63"
                value={value.lossRatePercentText}
                onChange={(e) => patch({ lossRatePercentText: e.target.value })}
              />
              <FieldError
                message={parseNumberText(value.lossRatePercentText, LOSS_RATE_PERCENT_FORMAT).error}
              />
            </label>
          ) : null}
        </div>
      )}
      {preview.error ? <FieldError message={preview.error} /> : null}
      {preview.result ? <LostRetirementDetail result={preview.result} /> : null}
    </SectionCard>
  );
}

export function LostRetirementDetail({ result }: { result: LostRetirementResult }) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 text-xs"
      data-testid="compensation-lost-retirement-detail"
    >
      <PairRows rows={lostRetirementDetailRows(result)} />
      <span className="font-medium">일실퇴직금</span>
      <span className="text-right font-medium">{formatWon(result.amountWon)}</span>
      {result.warnings.map((w) => (
        <span key={w.code} className="col-span-2 text-amber-700 dark:text-amber-300">
          {w.message}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- 중복장해율 */

/**
 * 중복장해율 계산 도우미. 장해율(%) 최대 5개를 넣으면 1 − Π(1 − rᵢ) 를 소수 2자리에서 버린 값을
 * 보여 주고, 영구장해 행이나 일실퇴직금 상실률 칸으로 옮긴다. 계산에는 직접 쓰지 않는다.
 */
export function DisabilityRateHelper({
  onAddPermanent,
  onUseForRetirement,
}: {
  onAddPermanent: (percent: number) => void;
  onUseForRetirement?: (percent: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [texts, setTexts] = useState<string[]>(["", "", "", "", ""]);
  let combined: number | undefined;
  let error: string | undefined;
  const rates = texts.map((t) => parseNumberText(t, LOSS_RATE_PERCENT_FORMAT));
  const firstError = rates.find((r) => r.error)?.error;
  const values = rates.flatMap((r) => (r.value === undefined ? [] : [r.value]));
  if (firstError) {
    error = firstError;
  } else if (values.length > 0) {
    try {
      combined = combineDisabilityRatesPercent(values);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        중복장해율 계산 도우미
      </Button>
    );
  }
  return (
    <div
      className="grid gap-2 rounded-md border border-border p-3"
      data-testid="compensation-disability-helper"
    >
      <span className="text-xs text-muted-foreground">
        장해율(%)을 넣으면 1 − Π(1 − rᵢ)를 소수 2자리에서 버린 중복장해율을 보여 줍니다. 계산에 바로
        쓰이지 않고, 아래 버튼으로 칸에 옮길 때만 반영됩니다.
      </span>
      <div className="grid grid-cols-5 gap-2">
        {texts.map((text, i) => (
          <Input
            key={i}
            inputMode="decimal"
            aria-label={`장해율 ${i + 1} (%)`}
            placeholder="%"
            value={text}
            onChange={(e) => setTexts(texts.map((other, j) => (j === i ? e.target.value : other)))}
          />
        ))}
      </div>
      <FieldError message={error} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          중복장해율:{" "}
          <span className="font-medium" data-testid="compensation-disability-helper-result">
            {combined === undefined ? "-" : `${combined}%`}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={combined === undefined}
          onClick={() => combined !== undefined && onAddPermanent(combined)}
        >
          영구장해 행으로 추가
        </Button>
        {onUseForRetirement ? (
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={combined === undefined}
            onClick={() => combined !== undefined && onUseForRetirement(combined)}
          >
            일실퇴직금 상실률로 넣기
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- 원고별 귀속 */

function RoundingSelect({
  value,
  onChange,
}: {
  value: ClaimantRounding;
  onChange: (value: ClaimantRounding) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      원고별 최종액 절사
      <Select value={value} onChange={(e) => onChange(e.target.value as ClaimantRounding)}>
        {Object.entries(CLAIMANT_ROUNDING_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <span className="text-xs font-normal text-muted-foreground">
        원고별 귀속을 쓰지 않으면 최종 합계에서 100원 미만을 버립니다. 원 단위를 고르면 원고마다 그
        절사를 하지 않아, 귀속을 끌 때보다 원고마다 99원까지 많을 수 있습니다.
      </span>
    </label>
  );
}

/** 이름 · 위자료 행 목록 (추가·삭제). 부상 가족 원고와 사망 상속인 아닌 유족이 같이 쓴다. */
function SolatiumClaimantRows({
  title,
  noun,
  placeholder,
  rows,
  onChange,
}: {
  title: string;
  noun: string;
  placeholder: string;
  rows: FamilyClaimantRow[];
  onChange: (rows: FamilyClaimantRow[]) => void;
}) {
  const update = (uid: string, next: Partial<FamilyClaimantRow>) =>
    onChange(rows.map((r) => (r.uid === uid ? { ...r, ...next } : r)));
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => onChange([...rows, emptyFamilyClaimant()])}
        >
          <Plus className="mr-1 h-3 w-3" />
          추가
        </Button>
      </div>
      {rows.map((row) => (
        <div key={row.uid} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
          <Input
            placeholder={placeholder}
            aria-label={`${noun} 이름`}
            value={row.name}
            onChange={(e) => update(row.uid, { name: e.target.value })}
          />
          <Input
            inputMode="numeric"
            placeholder="위자료 (원)"
            aria-label={`${noun} 위자료`}
            value={formatWonInput(row.solatiumText)}
            onChange={(e) => update(row.uid, { solatiumText: parseWonText(e.target.value) })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${noun} 삭제`}
            type="button"
            onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </>
  );
}

/** 보험약관 지급기준일 때 고유 위자료 처리 안내 (부상·사망 공용). */
const OWN_SOLATIUM_FAULT_HINT =
  "판결 방식은 고유 위자료에 책임비율을 곱하지 않고, 기본사항의 보험약관 지급기준을 켜면 피해자(망인) 위자료처럼 과실을 곱합니다.";

export function InjuryClaimantsCard({
  value,
  onChange,
}: {
  value: InjuryClaimantsFormState;
  onChange: (value: InjuryClaimantsFormState) => void;
}) {
  const patch = (next: Partial<InjuryClaimantsFormState>) => onChange({ ...value, ...next });
  return (
    <SectionCard
      title="원고별 귀속 (선택)"
      hint={`피해자 본인과 가족 원고로 최종액을 나눕니다. 가족 원고의 청구는 고유 위자료입니다 (서울고법 2022. 2. 18. 선고 2020나2039267). ${OWN_SOLATIUM_FAULT_HINT} 쓰면 최종 합계는 원고별 최종액의 합입니다.`}
      enabled={value.enabled}
      toggleLabel="원고별 귀속 사용"
      onToggle={(enabled) => patch({ enabled })}
      testId="compensation-claimants-card"
    >
      <SolatiumClaimantRows
        title="가족 원고 (이름 · 위자료)"
        noun="가족 원고"
        placeholder="이름 (예: 배우자)"
        rows={value.family}
        onChange={(family) => patch({ family })}
      />
      <RoundingSelect
        value={value.finalRounding}
        onChange={(finalRounding) => patch({ finalRounding })}
      />
    </SectionCard>
  );
}

export function DeathClaimantsCard({
  value,
  onChange,
  heirNames,
  includeHeirs,
  industrial,
}: {
  value: DeathClaimantsFormState;
  onChange: (value: DeathClaimantsFormState) => void;
  heirNames: string[];
  includeHeirs: boolean;
  industrial: boolean;
}) {
  const patch = (next: Partial<DeathClaimantsFormState>) => onChange({ ...value, ...next });
  const duplicate = new Set(heirNames).size !== heirNames.length;
  const names = [...new Set(heirNames)];
  const orphaned = orphanedOwnSolatium(value, names);
  return (
    <SectionCard
      title="원고별 귀속 (선택)"
      hint={`망인의 손해(재산상 손해 × 책임비율 − 공제 + 망인 위자료)를 상속분대로 나눈 뒤 상속인마다 고유 위자료와 장례비(지출한 상속인)를 더합니다. 아래 상속인 입력이 필요합니다. 상속인이 아닌 유족(예: 자녀가 있을 때의 부모)의 고유 위자료는 아래 "상속인 아닌 유족" 행으로 넣으면 원고별 최종액에 따로 실립니다. ${OWN_SOLATIUM_FAULT_HINT}`}
      enabled={value.enabled}
      toggleLabel="원고별 귀속 사용"
      onToggle={(enabled) => patch({ enabled })}
      testId="compensation-death-claimants-card"
    >
      {!includeHeirs || names.length === 0 ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          상속인을 먼저 입력하세요 (아래 &quot;상속인&quot; 카드의 상속분 분배 사용).
        </p>
      ) : (
        <>
          {duplicate ? (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              상속인 이름이 서로 달라야 원고별로 계산할 수 있습니다.
            </p>
          ) : null}
          <span className="text-xs font-medium text-muted-foreground">상속인별 고유 위자료</span>
          {orphaned.length > 0 ? (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              지금 상속인 목록에 없는 이름의 고유 위자료는 계산·저장하지 않습니다:{" "}
              {orphaned.map((item) => `${item.name} ${formatWon(item.won)}`).join(", ")}. 상속인
              이름을 바꿨다면 새 이름 칸에 다시 입력하세요.
            </p>
          ) : null}
          {names.map((name) => (
            <label key={name} className="grid grid-cols-[1fr_160px] items-center gap-2 text-sm">
              {name}
              <Input
                inputMode="numeric"
                placeholder="위자료 (원)"
                aria-label={`${name} 고유 위자료`}
                value={formatWonInput(value.ownSolatium[name] ?? "")}
                onChange={(e) =>
                  patch({
                    ownSolatium: { ...value.ownSolatium, [name]: parseWonText(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          <label className="grid gap-2 text-sm font-medium">
            장례비 지출 상속인
            <Select
              value={value.funeralPayer}
              onChange={(e) => patch({ funeralPayer: e.target.value })}
            >
              <option value="">지정 안 함 (상속분대로 나눔)</option>
              {value.funeralPayer && !names.includes(value.funeralPayer) ? (
                <option value={value.funeralPayer}>
                  {value.funeralPayer} (지금 상속인 목록에 없음)
                </option>
              ) : null}
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          {industrial ? (
            <label className="grid gap-2 text-sm font-medium">
              산재 장의비 (원, 선택)
              <Input
                inputMode="numeric"
                aria-label="산재 장의비"
                value={formatWonInput(value.funeralBenefitText)}
                onChange={(e) => patch({ funeralBenefitText: parseWonText(e.target.value) })}
              />
              <span className="text-xs font-normal text-muted-foreground">
                산재 수급자가 제3자(가해자)를 상대로 청구하는 경우를 전제로, 장례비를 지출한
                상속인의 장례비 손해에서만 그 금액을 한도로 먼저 빼고 과실상계합니다 (대법원 2022.
                4. 14. 선고 2021다252472, 2021다241618 전원합의체 인용). 장례비 지출 상속인을 골라야
                합니다.
              </span>
            </label>
          ) : null}
          <SolatiumClaimantRows
            title="상속인 아닌 유족 고유 위자료 (이름 · 위자료)"
            noun="상속인 아닌 유족"
            placeholder="이름 (예: 망인의 모)"
            rows={value.others}
            onChange={(others) => patch({ others })}
          />
        </>
      )}
      <RoundingSelect
        value={value.finalRounding}
        onChange={(finalRounding) => patch({ finalRounding })}
      />
    </SectionCard>
  );
}

const TABLE_HEAD = "border-b border-border text-left text-xs text-muted-foreground";

export function InjuryClaimantsTable({
  claimants,
}: {
  claimants: NonNullable<CompensationResult["claimants"]>;
}) {
  return (
    <Card data-testid="compensation-claimants-table">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">원고별 최종액</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLE_HEAD}>
              <th className="py-2 font-medium">원고</th>
              <th className="py-2 text-right font-medium">위자료</th>
              <th className="py-2 text-right font-medium">최종액</th>
            </tr>
          </thead>
          <tbody>
            {claimants.map((c, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="py-2">{injuryClaimantLabel(c)}</td>
                <td className="py-2 text-right">{formatWon(c.solatiumWon)}</td>
                <td className="py-2 text-right">{formatWon(c.amountWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          피해자 본인은 재산상 손해(과실상계·공제 후)와 위자료, 가족 원고는 고유 위자료입니다.
        </p>
      </CardContent>
    </Card>
  );
}

export function DeathClaimantsTable({ result }: { result: CompensationAutoDeathResult }) {
  const shares = result.inheritanceShares ?? [];
  const benefit = shares.some((s) => s.funeralBenefitDeductedWon !== undefined);
  const survivor = shares.some((s) => s.survivorBenefitDeductedWon !== undefined);
  return (
    <Card data-testid="compensation-death-claimants-table">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">원고별 귀속</CardTitle>
        {result.estateWon !== undefined ? (
          <p className="text-xs text-muted-foreground">
            상속대상 금액 {formatWon(result.estateWon)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto p-4 pt-0">
        <table className="w-full text-sm">
          <thead>
            <tr className={TABLE_HEAD}>
              <th className="py-2 font-medium">원고</th>
              <th className="py-2 font-medium">지분</th>
              {survivor ? <th className="py-2 text-right font-medium">유족급여 공제</th> : null}
              <th className="py-2 text-right font-medium">상속 재산상 손해</th>
              <th className="py-2 text-right font-medium">상속 위자료</th>
              <th className="py-2 text-right font-medium">고유 위자료</th>
              <th className="py-2 text-right font-medium">장례비</th>
              {benefit ? <th className="py-2 text-right font-medium">장의비 공제</th> : null}
              <th className="py-2 text-right font-medium">최종액</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((s, i) => (
              <tr key={`${s.name}-${i}`} className="border-b border-border last:border-b-0">
                <td className="py-2">{s.name}</td>
                <td className="py-2 font-mono">
                  {s.numerator}/{s.denominator}
                </td>
                {survivor ? (
                  <td className="py-2 text-right">
                    {formatWon(s.survivorBenefitDeductedWon ?? 0)}
                  </td>
                ) : null}
                <td className="py-2 text-right">{formatWon(s.inheritedPecuniaryWon ?? 0)}</td>
                <td className="py-2 text-right">{formatWon(s.inheritedSolatiumWon ?? 0)}</td>
                <td className="py-2 text-right">{formatWon(s.ownSolatiumWon ?? 0)}</td>
                <td className="py-2 text-right">{formatWon(s.funeralWon ?? 0)}</td>
                {benefit ? (
                  <td className="py-2 text-right">{formatWon(s.funeralBenefitDeductedWon ?? 0)}</td>
                ) : null}
                <td className="py-2 text-right">{formatWon(s.amountWon)}</td>
              </tr>
            ))}
            {(result.otherClaimants ?? []).map((o, i) => (
              <tr
                key={`other-${o.name}-${i}`}
                className="border-b border-border last:border-b-0"
                data-testid="compensation-death-other-claimant-row"
              >
                <td className="py-2">{o.name} (상속인 아님)</td>
                <td className="py-2 font-mono">-</td>
                {survivor ? <td className="py-2 text-right">-</td> : null}
                <td className="py-2 text-right">-</td>
                <td className="py-2 text-right">-</td>
                <td className="py-2 text-right">{formatWon(o.solatiumWon)}</td>
                <td className="py-2 text-right">-</td>
                {benefit ? <td className="py-2 text-right">-</td> : null}
                <td className="py-2 text-right">{formatWon(o.amountWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          상속분 곱셈의 원 미만은 버리고 나머지 원은 배정하지 않아, 원고별 최종액의 합이 상속대상
          금액보다 몇 원 적을 수 있습니다.
        </p>
        {benefit ? (
          <p className="mt-1 text-xs text-muted-foreground">
            장례비 열은 장의비 공제 열의 금액을 먼저 뺀 뒤 과실상계한 금액입니다.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------- 지연손해금 */

export function DelayDamagesCard({
  value,
  onChange,
  accidentDate,
  computed,
  stale = false,
}: {
  value: DelayDamagesFormState;
  onChange: (value: DelayDamagesFormState) => void;
  accidentDate: string;
  computed: { value?: DelayDamagesExport; error?: string };
  /** 입력이 결과 이후 바뀌었으면 낡은 원금으로 계산한 표를 숨긴다. */
  stale?: boolean;
}) {
  const patch = (next: Partial<DelayDamagesFormState>) => onChange({ ...value, ...next });
  return (
    <SectionCard
      title="지연손해금 (선택)"
      hint="계산 결과 최종액에 대한 판결 주문형 지연손해금입니다. 판결 선고일까지 민법 연 5%, 다음 날부터 소송촉진 등에 관한 특례법 이율을 적용합니다. 피고가 이행의무의 존부나 범위를 다투는 것이 타당한 범위를 선고일까지로 본 문구이므로(같은 법 제3조 제2항), 사건에서 그 범위가 다르면 기산일·선고일 칸을 그에 맞게 바꾸세요. 기산일은 위자료·장례비를 포함한 최종액 전부에 사고일을 씁니다. 불법행위로 인한 손해배상채무는 불법행위일부터 지체책임이 생긴다는 판례 입장에 따른 것이므로, 기산일이 다른 항목은 기산일 칸을 바꿔 따로 계산하세요. 손해배상액에는 들어가지 않고 파일에 저장하지 않습니다."
      enabled={value.enabled}
      toggleLabel="지연손해금 계산"
      onToggle={(enabled) => patch({ enabled })}
      testId="compensation-delay-damages-card"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          기산일
          <Input
            type="date"
            value={value.startDate || accidentDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
          <span className="text-xs font-normal text-muted-foreground">
            따로 고치기 전에는 사고일입니다.
          </span>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          판결 선고일
          <Input
            type="date"
            value={value.judgmentDate}
            onChange={(e) => patch({ judgmentDate: e.target.value })}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          제1심 변론종결일 (선택)
          <Input
            type="date"
            value={value.closingDate}
            onChange={(e) => patch({ closingDate: e.target.value })}
          />
          <span className="text-xs font-normal text-muted-foreground">
            소송촉진 등에 관한 특례법 이율은 이 날 시행 중인 이율입니다. 비우면 선고일로 봅니다.
          </span>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          계산 기준일
          <Input
            type="date"
            value={value.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
          />
        </label>
      </div>
      {stale && value.enabled ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          입력이 바뀌었습니다. 다시 계산하면 새 최종액으로 지연손해금을 계산합니다.
        </p>
      ) : null}
      {!stale && computed.error ? <FieldError message={computed.error} /> : null}
      {!stale && computed.value && computed.value.rows.length > 0 ? (
        <div className="grid gap-2" data-testid="compensation-delay-damages-result">
          <table className="w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD}>
                <th className="py-2 font-medium">원고</th>
                <th className="py-2 text-right font-medium">원금</th>
                <th className="py-2 text-right font-medium">지연손해금</th>
                <th className="py-2 text-right font-medium">원리금</th>
              </tr>
            </thead>
            <tbody>
              {computed.value.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right">{formatWon(r.principalWon)}</td>
                  <td className="py-2 text-right">{formatWon(r.interestWon)}</td>
                  <td className="py-2 text-right">{formatWon(r.totalWon)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {computed.value.rows.map((r, i) => (
            <p key={i} className="text-xs" data-testid="compensation-delay-order-text">
              {r.label === "최종 합계" ? "" : `${r.label}에게 `}
              {r.orderText}
            </p>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

/** 조정안·판결 이유 형식 문단 카드. 부상·사망 공용. */
export function DocumentTextCard({
  value,
  onChange,
  computed,
  stale = false,
}: {
  value: DocumentFormState;
  onChange: (value: DocumentFormState) => void;
  computed: { value?: DocumentExport; error?: string };
  stale?: boolean;
}) {
  const patch = (next: Partial<DocumentFormState>) => onChange({ ...value, ...next });
  return (
    <SectionCard
      title="조정안·판결 이유 형식 문단 (선택)"
      hint="계산 결과를 조정안 또는 판결 이유 형식의 문단과 별지 일실수입 계산표로 정리합니다. 조정안은 피고 책임비율을 가감 폭만큼 올리고 내린 금액과, 사고일부터 조정일까지 연 5% 이자(지연손해금과 같은 기간식)를 더한 금액을 함께 적습니다. 소장 송달일을 넣으면 그 다음 날부터 조정일까지는 소송촉진 등에 관한 특례법 이율(개정 연혁대로)을 적용합니다. 이는 피고가 이행의무의 존부나 범위를 다투는 것이 타당한 범위가 없다고 본 가정이므로(같은 법 제3조 제2항), 사건에서 그 범위가 다르면 송달일 칸을 비우거나 바꾸세요. 조정안 금액은 합의를 위한 시나리오이고 확정된 배상액이 아닙니다. 이자는 위자료·장례비를 포함한 최종액 전부에 사고일부터 붙입니다. 불법행위로 인한 손해배상채무는 불법행위일부터 지체책임이 생긴다는 판례 입장에 따른 것이므로, 기산일이 다른 항목은 지연손해금 카드의 기산일 칸을 바꿔 따로 계산하세요. 조정일은 이자 끝날로만 쓰고 일실수입 현가는 사고일 기준 그대로입니다. 복사·PDF·CSV에 함께 실리며 파일에 저장하지 않습니다."
      enabled={value.enabled}
      toggleLabel="문단 만들기"
      onToggle={(enabled) => patch({ enabled })}
      testId="compensation-document-card"
    >
      <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="문단 형식">
        {(Object.keys(DOCUMENT_FORMAT_LABELS) as DocumentFormat[]).map((format) => (
          <label key={format} className="flex items-center gap-2">
            <input
              type="radio"
              name="compensation-document-format"
              checked={value.format === format}
              onChange={() => patch({ format })}
            />
            {DOCUMENT_FORMAT_LABELS[format]}
          </label>
        ))}
      </div>
      {value.format === "mediation" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            조정일
            <Input
              type="date"
              value={value.mediationDate}
              onChange={(e) => patch({ mediationDate: e.target.value })}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            소장 송달일 (선택)
            <Input
              type="date"
              value={value.serviceDate}
              onChange={(e) => patch({ serviceDate: e.target.value })}
            />
            <span className="text-xs font-normal text-muted-foreground">
              비우면 조정일까지 연 5%만 적용합니다. 피고가 이행의무의 존부나 범위를 다투는 것이
              타당한 범위가 있으면(같은 법 제3조 제2항) 송달일 대신 그 범위가 끝나는 날을 넣으세요.
            </span>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            책임비율 가감 폭 (%p)
            <Input
              inputMode="decimal"
              value={value.spreadPercentText}
              onChange={(e) => patch({ spreadPercentText: e.target.value })}
            />
          </label>
        </div>
      ) : null}
      {stale ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          입력이 바뀌었습니다. 다시 계산하면 새 결과로 문단을 만듭니다.
        </p>
      ) : null}
      {!stale && computed.error ? <FieldError message={computed.error} /> : null}
      {!stale && computed.value ? (
        <div className="grid gap-2" data-testid="compensation-document-result">
          {computed.value.scenarios.length > 0 ? (
            <table className="w-full text-sm" data-testid="compensation-mediation-scenarios">
              <thead>
                <tr className={TABLE_HEAD}>
                  <th className="py-2 font-medium">피고 책임</th>
                  <th className="py-2 text-right font-medium">손해배상금</th>
                  <th className="py-2 text-right font-medium">조정일까지 이자</th>
                  <th className="py-2 text-right font-medium">이자 포함</th>
                </tr>
              </thead>
              <tbody>
                {computed.value.scenarios.map((r) => (
                  <tr
                    key={r.responsibilityPercent}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-2">{r.responsibilityPercent}%</td>
                    <td className="py-2 text-right">{formatWon(r.finalWon)}</td>
                    <td className="py-2 text-right">{formatWon(r.interestWon)}</td>
                    <td className="py-2 text-right">{formatWon(r.totalWon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {computed.value.blocks.map((b) => (
            <div key={b.title} className="grid gap-1">
              <p className="text-xs font-medium">{b.title}</p>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
                {b.lines.join("\n")}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}
