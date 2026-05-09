import { invoke } from "@tauri-apps/api/core";

import type { CalcOptions, InterestInput, InterestResult } from "@lawcalc-kr/core-engine";

export interface PdfOptions {
  /** Optional free-form note rendered below the segment table. */
  note?: string;
}

/**
 * Wire-compatible `.lcalc` document. Mirrors the Rust `LcalcFile` struct in
 * `src-tauri/src/commands/lcalc.rs` and §5.4 of the project design.
 *
 * The Rust shell only enforces `schemaVersion`; the renderer is the source of
 * truth for `input` / `options` / `result` shapes.
 */
export interface LcalcFile {
  schemaVersion: string;
  appVersion: string;
  dataVersion: string;
  createdAt: string;
  input: InterestInput;
  options: CalcOptions;
  result: InterestResult;
  note?: string;
  disclaimer: string;
}

export const ipc = {
  /**
   * Opens a save dialog and writes a PDF report. Resolves to the chosen path,
   * or `null` if the user cancelled the dialog.
   */
  exportPdf(result: InterestResult, options?: PdfOptions): Promise<string | null> {
    return invoke<string | null>("export_pdf", { result, options: options ?? null });
  },
  /**
   * Opens a save dialog and writes a UTF-8 BOM CSV (Excel-friendly).
   * Resolves to the chosen path, or `null` if the user cancelled.
   */
  exportCsv(result: InterestResult): Promise<string | null> {
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
  loadLcalc(): Promise<LcalcFile | null> {
    return invoke<LcalcFile | null>("load_lcalc");
  },
  copyToClipboard(text: string): Promise<void> {
    return invoke("copy_to_clipboard", { text });
  },
};
