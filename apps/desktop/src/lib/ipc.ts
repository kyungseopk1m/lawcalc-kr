import { invoke } from "@tauri-apps/api/core";

import type {
  AppropriationInput,
  AppropriationResult,
  CalcOptions,
  InheritanceInput,
  InheritanceResult,
  InterestInput,
  InterestResult,
  LitigationCostInput,
  LitigationCostResult,
} from "@lawcalc-kr/core-engine";
import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import type {
  CompensationAutoDeathInput,
  CompensationAutoDeathResult,
  CompensationInput,
  CompensationResult,
} from "@lawcalc-kr/compensation";

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
  | "compensation";

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
      kind: "case";
      envelopeFeatures: string[];
      dataVersions: Record<string, string>;
      payload: LcalcCasePayload;
    };

export type LoadableLcalcFile = LcalcFile | LcalcFileV2 | LcalcFileV1;

export const ipc = {
  /**
   * Opens a save dialog and writes a PDF report. Resolves to the chosen path,
   * or `null` if the user cancelled the dialog. `options.path` is a legacy
   * filename hint and is ignored by the Rust shell.
   */
  exportPdf(result: InterestResult, options?: PdfOptions): Promise<string | null> {
    const note = options?.note;
    return invoke<string | null>("export_pdf", {
      result: { ...result, disclaimer: STANDARD_DISCLAIMER },
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
      result: { ...result, disclaimer: STANDARD_DISCLAIMER },
    });
  },
  exportInheritancePdf(result: InheritanceResult): Promise<string | null> {
    return invoke<string | null>("export_inheritance_pdf", { result });
  },
  exportInheritanceCsv(result: InheritanceResult): Promise<string | null> {
    return invoke<string | null>("export_inheritance_csv", { result });
  },
  exportLitigationCostPdf(result: LitigationCostResult): Promise<string | null> {
    return invoke<string | null>("export_litigation_cost_pdf", { result });
  },
  exportLitigationCostCsv(result: LitigationCostResult): Promise<string | null> {
    return invoke<string | null>("export_litigation_cost_csv", { result });
  },
  exportCompensationPdf(result: CompensationResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_pdf", { result });
  },
  exportCompensationCsv(result: CompensationResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_csv", { result });
  },
  exportCompensationDeathPdf(result: CompensationAutoDeathResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_death_pdf", { result });
  },
  exportCompensationDeathCsv(result: CompensationAutoDeathResult): Promise<string | null> {
    return invoke<string | null>("export_compensation_death_csv", { result });
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
  copyToClipboard(text: string): Promise<void> {
    return invoke("copy_to_clipboard", { text });
  },
};
