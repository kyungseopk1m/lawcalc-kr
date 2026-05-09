import { invoke } from "@tauri-apps/api/core";

import type {
  CalcOptions,
  InheritanceInput,
  InheritanceResult,
  InterestInput,
  InterestResult,
} from "@lawcalc-kr/core-engine";

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
  input: InheritanceInput;
  result?: InheritanceResult;
  note?: string;
}

export type LcalcFile =
  | { schemaVersion: "2"; kind: "interest"; payload: LcalcInterestPayload }
  | { schemaVersion: "2"; kind: "inheritance"; payload: LcalcInheritancePayload };

export type LoadableLcalcFile = LcalcFile | LcalcFileV1;

export const ipc = {
  /**
   * Opens a save dialog and writes a PDF report. Resolves to the chosen path,
   * or `null` if the user cancelled the dialog. `options.path` is a legacy
   * filename hint and is ignored by the Rust shell.
   */
  exportPdf(result: InterestResult, options?: PdfOptions): Promise<string | null> {
    const note = options?.note;
    return invoke<string | null>("export_pdf", {
      result,
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
    return invoke<string | null>("export_csv", { result });
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
