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
