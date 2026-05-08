import { invoke } from "@tauri-apps/api/core";

// W2에서 A 세션의 @lawcalc-kr/core-engine InterestResult 타입으로 교체.
// W1 시점에는 wire-level 호환을 위해 unknown payload로 stub.
export type InterestResultPayload = unknown;

export interface PdfOptions {
  path: string;
  note?: string;
}

export interface LcalcFile {
  schemaVersion: string;
  appVersion: string;
  dataVersion: string;
  createdAt: string;
  input: unknown;
  options: unknown;
  result: InterestResultPayload;
  note?: string;
  disclaimer: string;
}

export const ipc = {
  exportPdf(input: InterestResultPayload, options: PdfOptions): Promise<string> {
    return invoke<string>("export_pdf", { input, options });
  },
  exportCsv(input: InterestResultPayload, path: string): Promise<void> {
    return invoke("export_csv", { input, path });
  },
  saveLcalc(payload: LcalcFile, path: string): Promise<void> {
    return invoke("save_lcalc", { payload, path });
  },
  loadLcalc(path: string): Promise<LcalcFile> {
    return invoke<LcalcFile>("load_lcalc", { path });
  },
  copyToClipboard(text: string): Promise<void> {
    return invoke("copy_to_clipboard", { text });
  },
};
