import { Plus, Trash2 } from "lucide-react";

import type {
  AttendantFutureSegmentInput,
  AttendantPastInput,
  OtherDamagesInput,
  TreatmentFutureInput,
  TreatmentPastInput,
} from "@lawcalc-kr/compensation";

import { formatWonInput, parseWonAmount, parseWonText } from "../lib/format-won";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

/**
 * 기타손해 입력 공유 컴포넌트 (개호비 · 치료비 · 보조구).
 *
 * 부상(`CompensationCalculator` 부상 view)·사망(사망 view) 양쪽이 동일한 기타손해 입력 UI를
 * 사용하도록 추출한 모듈. v0.6 `inheritance-heirs.tsx` 의 "폼 state 타입 + 빌더/적용 헬퍼 +
 * 컴포넌트" 패턴을 차용한다. 폼 state(`uid + text` 행)와 도메인 입력(`OtherDamagesInput`) 간
 * 변환 헬퍼를 함께 제공하며, 모든 섹션이 비면 `buildOtherDamagesInput` 이 `undefined` 를
 * 반환해 회귀 0(미입력 시 기존 결과 byte-identical)을 보장한다.
 *
 * 단가는 직종(`occupation`)과 직접 일당(`directDailyWageWon`)을 토글하지 않고, 직종 입력칸과
 * 직접일당 입력칸을 함께 두되 직접일당이 입력되면 엔진이 그 값을 우선한다(엔진 `resolveDailyWage`).
 */

function newUid(): string {
  return crypto.randomUUID();
}

export interface AttendantPastRow {
  uid: string;
  occupation: string;
  directDailyWageWonText: string;
  totalDaysText: string;
  actualSpentWonText: string;
  priorRatioText: string;
}

export interface AttendantFutureRow {
  uid: string;
  occupation: string;
  directDailyWageWonText: string;
  startDate: string;
  endDate: string;
  personCountText: string;
  daysPerMonthText: string;
  priorRatioText: string;
}

export interface TreatmentPastRow {
  uid: string;
  label: string;
  costWonText: string;
  priorRatioText: string;
}

export interface TreatmentFutureRow {
  uid: string;
  label: string;
  costWonText: string;
  kind: "oneTime" | "recurring";
  firstDate: string;
  lastDate: string;
  lifespanMonthsText: string;
  priorRatioText: string;
}

export interface OtherDamagesFormState {
  attendantPast: AttendantPastRow[];
  attendantFuture: AttendantFutureRow[];
  treatmentPast: TreatmentPastRow[];
  treatmentFuture: TreatmentFutureRow[];
  appliance: TreatmentFutureRow[];
}

export function emptyAttendantPast(): AttendantPastRow {
  return {
    uid: newUid(),
    occupation: "",
    directDailyWageWonText: "",
    totalDaysText: "",
    actualSpentWonText: "",
    priorRatioText: "",
  };
}

export function emptyAttendantFuture(): AttendantFutureRow {
  return {
    uid: newUid(),
    occupation: "",
    directDailyWageWonText: "",
    startDate: "",
    endDate: "",
    personCountText: "",
    daysPerMonthText: "",
    priorRatioText: "",
  };
}

export function emptyTreatmentPast(): TreatmentPastRow {
  return { uid: newUid(), label: "", costWonText: "", priorRatioText: "" };
}

export function emptyTreatmentFuture(): TreatmentFutureRow {
  return {
    uid: newUid(),
    label: "",
    costWonText: "",
    kind: "oneTime",
    firstDate: "",
    lastDate: "",
    lifespanMonthsText: "",
    priorRatioText: "",
  };
}

export function defaultOtherDamagesFormState(): OtherDamagesFormState {
  return {
    attendantPast: [],
    attendantFuture: [],
    treatmentPast: [],
    treatmentFuture: [],
    appliance: [],
  };
}

function parseRatio(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function parsePositiveNumber(text: string): number {
  const trimmed = text.replaceAll(",", "").trim();
  if (trimmed.length === 0) return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 정수 필수 필드(수명 월/월 개호일수)용. 엔진 validator 가 `Number.isInteger` 를 요구하므로
 * 반올림해 UI 출력이 항상 validator 를 통과하도록 보장한다 (예: "1.5" → 2).
 */
function parsePositiveInteger(text: string): number {
  const value = parsePositiveNumber(text);
  return value > 0 ? Math.round(value) : 0;
}

function buildTreatmentFuture(rows: TreatmentFutureRow[]): TreatmentFutureInput[] {
  return rows
    .map((row) => {
      const costWon = parseWonAmount(row.costWonText, 0);
      const node: TreatmentFutureInput = {
        costWon,
        kind: row.kind,
        firstDate: row.firstDate,
        lastDate: row.kind === "oneTime" ? row.firstDate : row.lastDate,
      };
      const label = row.label.trim();
      if (label.length > 0) node.label = label;
      if (row.kind === "recurring") {
        const lifespan = parsePositiveInteger(row.lifespanMonthsText);
        if (lifespan > 0) node.lifespanMonths = lifespan;
      }
      const prior = parseRatio(row.priorRatioText);
      if (prior !== undefined && prior > 0) node.priorRatio = prior;
      return node;
    })
    .filter((node) => node.costWon > 0 && node.firstDate.length > 0 && node.lastDate.length > 0);
}

/** 폼 state → `OtherDamagesInput`. 모든 섹션이 비면 `undefined` 반환 (회귀 0). */
export function buildOtherDamagesInput(
  state: OtherDamagesFormState,
): OtherDamagesInput | undefined {
  const attendantPast: AttendantPastInput[] = state.attendantPast
    .map((row) => {
      const totalDays = parsePositiveNumber(row.totalDaysText);
      const node: AttendantPastInput = { totalDays };
      const occupation = row.occupation.trim();
      if (occupation.length > 0) node.occupation = occupation;
      const directWage = parseWonAmount(row.directDailyWageWonText, 0);
      if (directWage > 0) node.directDailyWageWon = directWage;
      const actual = parseWonAmount(row.actualSpentWonText, -1);
      if (actual >= 0) node.actualSpentWon = actual;
      const prior = parseRatio(row.priorRatioText);
      if (prior !== undefined && prior > 0) node.priorRatio = prior;
      return node;
    })
    .filter(
      (node) =>
        node.totalDays > 0 &&
        (node.occupation !== undefined || node.directDailyWageWon !== undefined),
    );

  const attendantFuture: AttendantFutureSegmentInput[] = state.attendantFuture
    .map((row) => {
      const node: AttendantFutureSegmentInput = {
        startDate: row.startDate,
        endDate: row.endDate,
        personCount: parsePositiveNumber(row.personCountText),
      };
      const occupation = row.occupation.trim();
      if (occupation.length > 0) node.occupation = occupation;
      const directWage = parseWonAmount(row.directDailyWageWonText, 0);
      if (directWage > 0) node.directDailyWageWon = directWage;
      const daysPerMonth = parsePositiveInteger(row.daysPerMonthText);
      if (daysPerMonth > 0) node.daysPerMonth = daysPerMonth;
      const prior = parseRatio(row.priorRatioText);
      if (prior !== undefined && prior > 0) node.priorRatio = prior;
      return node;
    })
    .filter(
      (node) =>
        node.startDate.length > 0 &&
        node.endDate.length > 0 &&
        node.personCount > 0 &&
        (node.occupation !== undefined || node.directDailyWageWon !== undefined),
    );

  const treatmentPast: TreatmentPastInput[] = state.treatmentPast
    .map((row) => {
      const node: TreatmentPastInput = { costWon: parseWonAmount(row.costWonText, 0) };
      const label = row.label.trim();
      if (label.length > 0) node.label = label;
      const prior = parseRatio(row.priorRatioText);
      if (prior !== undefined && prior > 0) node.priorRatio = prior;
      return node;
    })
    .filter((node) => node.costWon > 0);

  const treatmentFuture = buildTreatmentFuture(state.treatmentFuture);
  const appliance = buildTreatmentFuture(state.appliance);

  const input: OtherDamagesInput = {};
  if (attendantPast.length > 0 || attendantFuture.length > 0) {
    input.attendantCare = {};
    if (attendantPast.length > 0) input.attendantCare.past = attendantPast;
    if (attendantFuture.length > 0) input.attendantCare.future = attendantFuture;
  }
  if (treatmentPast.length > 0 || treatmentFuture.length > 0) {
    input.treatment = {};
    if (treatmentPast.length > 0) input.treatment.past = treatmentPast;
    if (treatmentFuture.length > 0) input.treatment.future = treatmentFuture;
  }
  if (appliance.length > 0) input.appliance = appliance;

  if (
    input.attendantCare === undefined &&
    input.treatment === undefined &&
    input.appliance === undefined
  ) {
    return undefined;
  }
  return input;
}

function applyTreatmentFuture(items: TreatmentFutureInput[] | undefined): TreatmentFutureRow[] {
  return (items ?? []).map((item) => ({
    uid: newUid(),
    label: item.label ?? "",
    costWonText: String(item.costWon),
    kind: item.kind,
    firstDate: item.firstDate,
    lastDate: item.lastDate,
    lifespanMonthsText: item.lifespanMonths === undefined ? "" : String(item.lifespanMonths),
    priorRatioText: item.priorRatio === undefined ? "" : String(item.priorRatio),
  }));
}

/** `OtherDamagesInput` → 폼 state (불러오기). `undefined` 면 default 빈 state. */
export function applyOtherDamagesInput(
  input: OtherDamagesInput | undefined,
): OtherDamagesFormState {
  if (input === undefined) return defaultOtherDamagesFormState();
  return {
    attendantPast: (input.attendantCare?.past ?? []).map((item) => ({
      uid: newUid(),
      occupation: item.occupation ?? "",
      directDailyWageWonText:
        item.directDailyWageWon === undefined ? "" : String(item.directDailyWageWon),
      totalDaysText: String(item.totalDays),
      actualSpentWonText: item.actualSpentWon === undefined ? "" : String(item.actualSpentWon),
      priorRatioText: item.priorRatio === undefined ? "" : String(item.priorRatio),
    })),
    attendantFuture: (input.attendantCare?.future ?? []).map((item) => ({
      uid: newUid(),
      occupation: item.occupation ?? "",
      directDailyWageWonText:
        item.directDailyWageWon === undefined ? "" : String(item.directDailyWageWon),
      startDate: item.startDate,
      endDate: item.endDate,
      personCountText: String(item.personCount),
      daysPerMonthText: item.daysPerMonth === undefined ? "" : String(item.daysPerMonth),
      priorRatioText: item.priorRatio === undefined ? "" : String(item.priorRatio),
    })),
    treatmentPast: (input.treatment?.past ?? []).map((item) => ({
      uid: newUid(),
      label: item.label ?? "",
      costWonText: String(item.costWon),
      priorRatioText: item.priorRatio === undefined ? "" : String(item.priorRatio),
    })),
    treatmentFuture: applyTreatmentFuture(input.treatment?.future),
    appliance: applyTreatmentFuture(input.appliance),
  };
}

/** dirty tracker 비교용 정규화 객체 (uid 의존 없음, build 결과와 동치). */
export function otherDamagesForDirtySnapshot(state: OtherDamagesFormState) {
  return buildOtherDamagesInput(state) ?? null;
}

interface RatioCellProps {
  value: string;
  onChange: (value: string) => void;
}

function RatioCell({ value, onChange }: RatioCellProps) {
  return (
    <Input
      inputMode="decimal"
      placeholder="기왕증 (0~1)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export interface OtherDamagesFormCardProps {
  value: OtherDamagesFormState;
  onChange: (value: OtherDamagesFormState) => void;
}

export function OtherDamagesFormCard({ value, onChange }: OtherDamagesFormCardProps) {
  const updateAttendantPast = (uid: string, patch: Partial<AttendantPastRow>) =>
    onChange({
      ...value,
      attendantPast: value.attendantPast.map((row) =>
        row.uid === uid ? { ...row, ...patch } : row,
      ),
    });
  const updateAttendantFuture = (uid: string, patch: Partial<AttendantFutureRow>) =>
    onChange({
      ...value,
      attendantFuture: value.attendantFuture.map((row) =>
        row.uid === uid ? { ...row, ...patch } : row,
      ),
    });
  const updateTreatmentPast = (uid: string, patch: Partial<TreatmentPastRow>) =>
    onChange({
      ...value,
      treatmentPast: value.treatmentPast.map((row) =>
        row.uid === uid ? { ...row, ...patch } : row,
      ),
    });
  const updateTreatmentFuture = (uid: string, patch: Partial<TreatmentFutureRow>) =>
    onChange({
      ...value,
      treatmentFuture: value.treatmentFuture.map((row) =>
        row.uid === uid ? { ...row, ...patch } : row,
      ),
    });
  const updateAppliance = (uid: string, patch: Partial<TreatmentFutureRow>) =>
    onChange({
      ...value,
      appliance: value.appliance.map((row) => (row.uid === uid ? { ...row, ...patch } : row)),
    });

  return (
    <Card data-testid="compensation-other-damages-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">기타손해 (개호비 · 치료비 · 보조구)</CardTitle>
        <p className="text-xs text-muted-foreground">
          민법 제393조·763조. 재산상 손해에 과실상계 전 합산됩니다. 미입력 시 결과에 영향이
          없습니다.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">기왕개호비</span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  attendantPast: [...value.attendantPast, emptyAttendantPast()],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              추가
            </Button>
          </div>
          {value.attendantPast.map((row) => (
            <div key={row.uid} className="grid gap-2 rounded-md border border-input p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="직종 (예: 보통인부)"
                  value={row.occupation}
                  onChange={(e) => updateAttendantPast(row.uid, { occupation: e.target.value })}
                />
                <Input
                  inputMode="numeric"
                  placeholder="직접 일당 (원)"
                  value={formatWonInput(row.directDailyWageWonText)}
                  onChange={(e) =>
                    updateAttendantPast(row.uid, {
                      directDailyWageWonText: parseWonText(e.target.value),
                    })
                  }
                />
                <Input
                  inputMode="numeric"
                  placeholder="총 개호일수"
                  value={row.totalDaysText}
                  onChange={(e) => updateAttendantPast(row.uid, { totalDaysText: e.target.value })}
                />
                <Input
                  inputMode="numeric"
                  placeholder="실지출 (원, 선택)"
                  value={formatWonInput(row.actualSpentWonText)}
                  onChange={(e) =>
                    updateAttendantPast(row.uid, {
                      actualSpentWonText: parseWonText(e.target.value),
                    })
                  }
                />
                <RatioCell
                  value={row.priorRatioText}
                  onChange={(next) => updateAttendantPast(row.uid, { priorRatioText: next })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="기왕개호비 삭제"
                type="button"
                className="justify-self-end"
                onClick={() =>
                  onChange({
                    ...value,
                    attendantPast: value.attendantPast.filter((item) => item.uid !== row.uid),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              향후개호비 (호프만 240 한도)
            </span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  attendantFuture: [...value.attendantFuture, emptyAttendantFuture()],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              추가
            </Button>
          </div>
          {value.attendantFuture.map((row) => (
            <div key={row.uid} className="grid gap-2 rounded-md border border-input p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="직종 (예: 보통인부)"
                  value={row.occupation}
                  onChange={(e) => updateAttendantFuture(row.uid, { occupation: e.target.value })}
                />
                <Input
                  inputMode="numeric"
                  placeholder="직접 일당 (원)"
                  value={formatWonInput(row.directDailyWageWonText)}
                  onChange={(e) =>
                    updateAttendantFuture(row.uid, {
                      directDailyWageWonText: parseWonText(e.target.value),
                    })
                  }
                />
                <label className="grid gap-1 text-xs text-muted-foreground">
                  시작일
                  <Input
                    type="date"
                    value={row.startDate}
                    onChange={(e) => updateAttendantFuture(row.uid, { startDate: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  종료일
                  <Input
                    type="date"
                    value={row.endDate}
                    onChange={(e) => updateAttendantFuture(row.uid, { endDate: e.target.value })}
                  />
                </label>
                <Input
                  inputMode="decimal"
                  placeholder="인원 (예: 1 / 0.5)"
                  value={row.personCountText}
                  onChange={(e) =>
                    updateAttendantFuture(row.uid, { personCountText: e.target.value })
                  }
                />
                <Input
                  inputMode="numeric"
                  placeholder="월 개호일수 (default 30)"
                  value={row.daysPerMonthText}
                  onChange={(e) =>
                    updateAttendantFuture(row.uid, { daysPerMonthText: e.target.value })
                  }
                />
                <RatioCell
                  value={row.priorRatioText}
                  onChange={(next) => updateAttendantFuture(row.uid, { priorRatioText: next })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="향후개호비 삭제"
                type="button"
                className="justify-self-end"
                onClick={() =>
                  onChange({
                    ...value,
                    attendantFuture: value.attendantFuture.filter((item) => item.uid !== row.uid),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">기왕치료비</span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  treatmentPast: [...value.treatmentPast, emptyTreatmentPast()],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              추가
            </Button>
          </div>
          {value.treatmentPast.map((row) => (
            <div key={row.uid} className="grid grid-cols-[1fr_140px_120px_auto] items-center gap-2">
              <Input
                placeholder="항목"
                value={row.label}
                onChange={(e) => updateTreatmentPast(row.uid, { label: e.target.value })}
              />
              <Input
                inputMode="numeric"
                placeholder="비용 (원)"
                value={formatWonInput(row.costWonText)}
                onChange={(e) =>
                  updateTreatmentPast(row.uid, { costWonText: parseWonText(e.target.value) })
                }
              />
              <RatioCell
                value={row.priorRatioText}
                onChange={(next) => updateTreatmentPast(row.uid, { priorRatioText: next })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="기왕치료비 삭제"
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    treatmentPast: value.treatmentPast.filter((item) => item.uid !== row.uid),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              향후치료비 (수치합계 20 한도)
            </span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  treatmentFuture: [...value.treatmentFuture, emptyTreatmentFuture()],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              추가
            </Button>
          </div>
          {value.treatmentFuture.map((row) => (
            <TreatmentFutureRowEditor
              key={row.uid}
              row={row}
              onPatch={(patch) => updateTreatmentFuture(row.uid, patch)}
              onRemove={() =>
                onChange({
                  ...value,
                  treatmentFuture: value.treatmentFuture.filter((item) => item.uid !== row.uid),
                })
              }
              removeLabel="향후치료비 삭제"
            />
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              보조구 (수치합계 20 한도)
            </span>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                onChange({ ...value, appliance: [...value.appliance, emptyTreatmentFuture()] })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              추가
            </Button>
          </div>
          {value.appliance.map((row) => (
            <TreatmentFutureRowEditor
              key={row.uid}
              row={row}
              onPatch={(patch) => updateAppliance(row.uid, patch)}
              onRemove={() =>
                onChange({
                  ...value,
                  appliance: value.appliance.filter((item) => item.uid !== row.uid),
                })
              }
              removeLabel="보조구 삭제"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface TreatmentFutureRowEditorProps {
  row: TreatmentFutureRow;
  onPatch: (patch: Partial<TreatmentFutureRow>) => void;
  onRemove: () => void;
  removeLabel: string;
}

function TreatmentFutureRowEditor({
  row,
  onPatch,
  onRemove,
  removeLabel,
}: TreatmentFutureRowEditorProps) {
  return (
    <div className="grid gap-2 rounded-md border border-input p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="항목 (예: 휠체어)"
          value={row.label}
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        <Input
          inputMode="numeric"
          placeholder="1회 비용 (원)"
          value={formatWonInput(row.costWonText)}
          onChange={(e) => onPatch({ costWonText: parseWonText(e.target.value) })}
        />
        <label className="grid gap-1 text-xs text-muted-foreground">
          발생 형태
          <Select
            value={row.kind}
            onChange={(e) => onPatch({ kind: e.target.value as "oneTime" | "recurring" })}
          >
            <option value="oneTime">1회성</option>
            <option value="recurring">반복</option>
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          최초 필요일
          <Input
            type="date"
            value={row.firstDate}
            onChange={(e) => onPatch({ firstDate: e.target.value })}
          />
        </label>
        {row.kind === "recurring" ? (
          <>
            <label className="grid gap-1 text-xs text-muted-foreground">
              최종 필요일
              <Input
                type="date"
                value={row.lastDate}
                onChange={(e) => onPatch({ lastDate: e.target.value })}
              />
            </label>
            <Input
              inputMode="numeric"
              placeholder="수명 주기 (월)"
              value={row.lifespanMonthsText}
              onChange={(e) => onPatch({ lifespanMonthsText: e.target.value })}
            />
          </>
        ) : null}
        <RatioCell
          value={row.priorRatioText}
          onChange={(next) => onPatch({ priorRatioText: next })}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={removeLabel}
        type="button"
        className="justify-self-end"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
