import { invoke } from "@tauri-apps/api/core";

import type {
  AppropriationInput,
  AppropriationResult,
  CalcOptions,
  DateSpanInput,
  DateSpanResult,
  DeadlineInput,
  DeadlineResult,
  InheritanceInput,
  InheritanceResult,
  InterestInput,
  InterestResult,
  LitigationCostInput,
  LitigationCostResult,
  PeriodInput,
  PeriodResult,
} from "@lawcalc-kr/core-engine";
import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import type {
  CompensationAutoDeathInput,
  CompensationAutoDeathResult,
  CompensationInput,
  CompensationResult,
} from "@lawcalc-kr/compensation";

import {
  applyDateStyle,
  applyDateStyleDeep,
  clipboardTextToHtml,
  readDateStyle,
} from "./output-format";

/** 변제충당 PDF·CSV 계산서. 문구는 `buildAppropriationExportView` 가 단일 출처로 만든다. */
export interface AppropriationExportView {
  summary: Array<[string, string]>;
  tables: Array<{ title: string; headers: string[]; rows: string[][] }>;
  notes: string[];
  disclaimer: string;
  dataVersion: string;
  computedAt: string;
}

export interface PdfOptions {
  /**
   * Optional default file name suggested in the save dialog. The Rust shell
   * always opens a save dialog regardless of this value, so it is treated as
   * a hint only and may be `undefined`.
   */
  path?: string;
  /** Optional free-form note rendered below the segment table. */
  note?: string;
}

/**
 * Legacy v1 `.lcalc` root document. Kept only as a renderer-side migration
 * input shape for files saved by v0.1.x.
 */
interface LcalcFileV1 {
  schemaVersion: "1";
  appVersion: string;
  dataVersion: string;
  createdAt: string;
  input: InterestInput;
  options: CalcOptions;
  result: InterestResult;
  note?: string;
  disclaimer: string;
}

/**
 * Legacy v2 `.lcalc` root document. Kept only as a renderer-side migration
 * input shape for files saved by v0.2.x.
 */
type LcalcFileV2 =
  | { schemaVersion: "2"; kind: "interest"; payload: LcalcInterestPayload }
  | { schemaVersion: "2"; kind: "inheritance"; payload: LcalcInheritancePayload };

export interface LcalcInterestPayload {
  appVersion: string;
  dataVersion: string;
  createdAt: string;
  input: InterestInput;
  options: CalcOptions;
  result: InterestResult;
  note?: string;
  disclaimer: string;
}

export interface LcalcInheritancePayload {
  appVersion: string;
  dataVersion: string;
  createdAt: string;
  input: InheritanceInput;
  result?: InheritanceResult;
  note?: string;
  disclaimer: string;
}

export interface LcalcLitigationCostPayload {
  appVersion: string;
  createdAt: string;
  input: LitigationCostInput;
  result?: LitigationCostResult;
  note?: string;
  disclaimer: string;
}

export interface LcalcAppropriationPayload {
  appVersion: string;
  createdAt: string;
  input: AppropriationInput;
  result?: AppropriationResult;
  note?: string;
  disclaimer: string;
}

/**
 * 자×부상 입력/결과에 `mode: "injury"` discriminator 를 더한 reader-side 타입.
 *
 * 엔진 측 `CompensationInput`/`CompensationResult` 는 `mode` 필드가 없다 (자×부상 전용
 * 슬라이스였던 v0.5.x 호환). `compensation@2` 부터 같은 envelope 에 자×사망이 합류하므로,
 * reader 는 `mode` 로 분기한다. `@1→@2` migration 이 기존 파일에 `mode: "injury"` 를 주입하고,
 * 신규 자×부상 저장도 `mode` 없이 저장될 수 있으므로 optional 로 둔다.
 */
export type LcalcCompensationInjuryInput = CompensationInput & { mode?: "injury" };
export type LcalcCompensationInjuryResult = CompensationResult & { mode?: "injury" };

export type LcalcCompensationInput = LcalcCompensationInjuryInput | CompensationAutoDeathInput;
export type LcalcCompensationResult = LcalcCompensationInjuryResult | CompensationAutoDeathResult;

/**
 * compensation `.lcalc` payload.
 *
 * `compensation@1` = 자×부상, `compensation@2` = 자×사망 (`input.mode === "death"`).
 * 두 capability 가 같은 `kind: "compensation"` envelope 를 공유하므로 payload 도 input/result
 * discriminated union 으로 표현한다.
 */
export interface LcalcCompensationPayload {
  appVersion: string;
  createdAt: string;
  input: LcalcCompensationInput;
  result?: LcalcCompensationResult;
  note?: string;
  disclaimer: string;
}

/** 기간 계산 탭이 화면에 띄우고 있는 계산. 두 산식이 입력을 공유한다. */
export type PeriodMode = "expiry" | "span";

/**
 * 기간 계산 탭의 `.lcalc` 입력.
 *
 * 화면이 만료일 산식과 일수 산식의 입력을 함께 들고 있으므로 둘 다 담고 `mode` 로
 * 어느 쪽을 계산했는지 남긴다. 저장 당시 보고 있지 않던 쪽 입력도 살아남아야
 * 파일을 다시 열었을 때 모드를 바꿔도 값이 그대로다.
 */
export interface PeriodTabInput {
  mode: PeriodMode;
  period: PeriodInput;
  span: DateSpanInput;
  /** 사용자가 지정한 공휴일. 비어 있으면 키 자체를 싣지 않는다 (`period@3`). */
  extraHolidays?: ExtraHolidayInput[];
}

/**
 * 번들 공휴일 데이터에 아직 없는 임시공휴일·선거일. 말일 연장 판정에 더한다.
 * `.lcalc` 입력에 그대로 저장해 같은 파일이 같은 만료일을 다시 낸다.
 */
export interface ExtraHolidayInput {
  date: string;
  nameKo: string;
}

/** 불변기한 탭의 `.lcalc` 입력. 엔진 입력에 사용자 지정 공휴일만 얹는다 (`deadline@3`). */
export type DeadlineTabInput = DeadlineInput & { extraHolidays?: ExtraHolidayInput[] };

interface LcalcPeriodResultMeta {
  /** 공휴일 dataset 식별자 (`holidays/vX.Y.Z`). 제161조 판정의 근거 데이터. */
  dataVersion: string;
  computedAt: string;
  disclaimer: string;
}

/** 저장된 계산 결과. `mode` 로 만료일 결과와 일수 결과를 가른다. */
export type LcalcPeriodResult =
  | ({ mode: "expiry" } & PeriodResult & LcalcPeriodResultMeta)
  | ({ mode: "span" } & DateSpanResult & LcalcPeriodResultMeta);

export interface LcalcPeriodPayload {
  appVersion: string;
  createdAt: string;
  input: PeriodTabInput;
  result?: LcalcPeriodResult;
  note?: string;
  disclaimer: string;
}

interface LcalcDeadlineResultMeta {
  /** 공휴일 dataset 식별자 (`holidays/vX.Y.Z`). 말일 조정 판정의 근거 데이터.
   *  법정기한 dataset 식별자는 엔진 결과의 `dataVersion` 에 이미 들어 있다. */
  holidaysVersion: string;
  computedAt: string;
  disclaimer: string;
}

/** 불변기한 탭이 저장하는 계산 결과. 엔진 결과 원본에 메타만 얹는다. */
export type LcalcDeadlineResult = DeadlineResult & LcalcDeadlineResultMeta;

export interface LcalcDeadlinePayload {
  appVersion: string;
  createdAt: string;
  input: DeadlineTabInput;
  result?: LcalcDeadlineResult;
  note?: string;
  disclaimer: string;
}

/** 사건 파일(case@1)의 사건 식별 정보. 모든 필드 선택. */
export interface LcalcCaseInfo {
  caseNumber?: string;
  title?: string;
  memo?: string;
}

/** 사건 파일이 담을 수 있는 계산 슬롯 키 (도메인 kind 와 1:1). */
export type LcalcCaseCalculationKey =
  | "interest"
  | "inheritance"
  | "litigation-cost"
  | "appropriation"
  | "compensation"
  | "period"
  | "deadline";

/**
 * 사건 파일(case@1) payload.
 *
 * `calculations` 의 각 항목은 해당 도메인의 단일 `.lcalc` envelope 전체를 그대로
 * 중첩한다 (schemaVersion 중복은 감수). 검증·불러오기가 기존 단일 도메인 경로를
 * 그대로 재사용할 수 있고, 사건 파일에서 계산 하나를 떼어내도 단독 파일로 유효하다.
 * 사건 안에 사건을 중첩하는 것은 허용하지 않는다.
 */
export interface LcalcCasePayload {
  appVersion: string;
  createdAt: string;
  caseInfo: LcalcCaseInfo;
  calculations: Partial<Record<LcalcCaseCalculationKey, LcalcFile>>;
  note?: string;
  disclaimer: string;
}

/**
 * v3 envelope — capability 메타 (envelopeFeatures) 와 데이터 슬라이스
 * (dataVersions) 를 envelope-level 로 분리한 형식. v0.3.0 부터 신규 저장
 * 파일은 v3 로만 저장된다. 기존 v1/v2 파일은 reader 의 migration registry
 * 에서 v3 로 변환된 뒤 검증/처리된다.
 *
 * - `envelopeFeatures`: `"{domain}@{engineMajor}"` 형식의 capability id 배열.
 *   reader 호환성 검증 (`fast-reject`) 에 사용되며, 미지원 capability 시
 *   payload 진입 없이 envelope 만 보고 한국어 메시지로 reject.
 * - `dataVersions`: 도메인별 dataset 슬라이스 식별자 맵. 단일 도메인에서는
 *   `{ [kind]: payload.dataVersion }` 와 동치이며, 향후 multi-sub-dataset
 *   도메인 (예: 인지/송달/변호사보수/사건구분 4 sub-domain 통합) 진입 시
 *   schema bump 없이 sub-dataset 추가가 가능하다.
 */
export type LcalcFile =
  | {
      schemaVersion: "3";
      kind: "interest";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcInterestPayload;
    }
  | {
      schemaVersion: "3";
      kind: "inheritance";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcInheritancePayload;
    }
  | {
      schemaVersion: "3";
      kind: "litigation-cost";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcLitigationCostPayload;
    }
  | {
      schemaVersion: "3";
      kind: "appropriation";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcAppropriationPayload;
    }
  | {
      schemaVersion: "3";
      kind: "compensation";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcCompensationPayload;
    }
  | {
      schemaVersion: "3";
      kind: "period";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcPeriodPayload;
    }
  | {
      schemaVersion: "3";
      kind: "deadline";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcDeadlinePayload;
    }
  | {
      schemaVersion: "3";
      kind: "case";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcCasePayload;
    };

export type LoadableLcalcFile = LcalcFile | LcalcFileV2 | LcalcFileV1;

/** HWPX 로 내보낼 수 있는 결과 종류 (Rust `export_hwpx` 의 `kind`). */
export type HwpxKind =
  | "interest"
  | "inheritance"
  | "litigation-cost"
  | "compensation"
  | "compensation-death"
  | "appropriation";

/** 설정한 날짜 표기를 내보내기 view 에 적용한다 (기본 `iso` 는 원본 그대로). */
const styled = <T>(value: T): T => applyDateStyleDeep(value, readDateStyle());

export const ipc = {
  /**
   * Opens a save dialog and writes a PDF report. Resolves to the chosen path,
   * or `null` if the user cancelled the dialog. `options.path` is a legacy
   * filename hint and is ignored by the Rust shell.
   */
  exportPdf(result: InterestResult, options?: PdfOptions): Promise<string | null> {
    const note = options?.note;
    return invoke<string | null>("export_pdf", {
      result: styled({ ...result, disclaimer: STANDARD_DISCLAIMER }),
      options: note !== undefined ? { note } : null,
    });
  },
  /**
   * Opens a save dialog and writes a UTF-8 BOM CSV (Excel-friendly).
   * Resolves to the chosen path, or `null` if the user cancelled. The
   * optional second parameter is a legacy filename hint and is ignored.
   */
  exportCsv(result: InterestResult, ...legacyPath: [string?]): Promise<string | null> {
    void legacyPath;
    return invoke<string | null>("export_csv", {
      result: styled({ ...result, disclaimer: STANDARD_DISCLAIMER }),
    });
  },
  exportInheritancePdf(result: InheritanceResult): Promise<string | null> {
    return invoke<string | null>("export_inheritance_pdf", { result: styled(result) });
  },
  exportInheritanceCsv(result: InheritanceResult): Promise<string | null> {
    return invoke<string | null>("export_inheritance_csv", { result: styled(result) });
  },
  exportLitigationCostPdf(result: LitigationCostResult): Promise<string | null> {
    return invoke<string | null>("export_litigation_cost_pdf", { result: styled(result) });
  },
  exportLitigationCostCsv(result: LitigationCostResult): Promise<string | null> {
    return invoke<string | null>("export_litigation_cost_csv", { result: styled(result) });
  },
  exportCompensationPdf(result: CompensationResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_pdf", { result: styled(result) });
  },
  exportCompensationCsv(result: CompensationResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_csv", { result: styled(result) });
  },
  exportAppropriationPdf(view: AppropriationExportView): Promise<string | null> {
    return invoke<string | null>("export_appropriation_pdf", { result: styled(view) });
  },
  exportAppropriationCsv(view: AppropriationExportView): Promise<string | null> {
    return invoke<string | null>("export_appropriation_csv", { result: styled(view) });
  },
  exportCompensationDeathPdf(result: CompensationAutoDeathResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_death_pdf", { result: styled(result) });
  },
  exportCompensationDeathCsv(result: CompensationAutoDeathResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_death_csv", { result: styled(result) });
  },
  /**
   * Opens a save dialog and writes the payload as pretty-printed JSON.
   * Resolves to the chosen path, or `null` if the user cancelled the dialog.
   */
  saveLcalc(payload: LcalcFile): Promise<string | null> {
    return invoke<string | null>("save_lcalc", { payload });
  },
  /**
   * Opens a file picker and reads the selected `.lcalc` document. Resolves to
   * `null` when the user cancels; rejects when `schemaVersion` mismatches.
   */
  loadLcalc(): Promise<LoadableLcalcFile | null> {
    return invoke<LoadableLcalcFile | null>("load_lcalc");
  },
  /**
   * 보고 있는 결과를 `.hwpx` (한글 문서)로 저장한다. 내용은 같은 view 의 CSV 와 같다.
   * 사용자가 대화 상자를 닫으면 `null`.
   */
  exportHwpx(kind: HwpxKind, result: unknown): Promise<string | null> {
    return invoke<string | null>("export_hwpx", { kind, result: styled(result) });
  },
  /** 일반 텍스트와 HTML 표 판을 함께 싣는다. 일반 텍스트는 날짜 표기 설정만 반영한다. */
  copyToClipboard(text: string): Promise<void> {
    const styledText = applyDateStyle(text, readDateStyle());
    return invoke("copy_to_clipboard", { text: styledText, html: clipboardTextToHtml(styledText) });
  },
};
