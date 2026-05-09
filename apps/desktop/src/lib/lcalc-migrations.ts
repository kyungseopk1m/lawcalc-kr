import type { LcalcFile, LcalcInterestPayload, LoadableLcalcFile } from "./ipc";

export type LcalcMigration = (raw: LoadableLcalcFile) => LcalcFile;
export type LcalcMigrationRegistry = Record<string, LcalcMigration>;

export const CURRENT_LCALC_SCHEMA_VERSION = "2";
export const unsupportedLcalcVersionMessage = (schemaVersion: string) =>
  `지원하지 않는 .lcalc 버전입니다: ${schemaVersion}`;
const unknownLcalcVersionMessage =
  ".lcalc 파일 형식을 확인할 수 없습니다. 파일이 손상되었거나 다른 프로그램이 만든 파일일 수 있습니다.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateV1ToV2(raw: Extract<LoadableLcalcFile, { schemaVersion: "1" }>): LcalcFile {
  const payload: LcalcInterestPayload = {
    appVersion: raw.appVersion,
    dataVersion: raw.dataVersion,
    createdAt: raw.createdAt,
    input: raw.input,
    options: raw.options,
    result: raw.result,
    disclaimer: raw.disclaimer,
  };

  if (raw.note !== undefined) {
    payload.note = raw.note;
  }

  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "interest",
    payload,
  };
}

const migrations: LcalcMigrationRegistry = {
  "1": (raw) => migrateV1ToV2(raw as Extract<LoadableLcalcFile, { schemaVersion: "1" }>),
  [CURRENT_LCALC_SCHEMA_VERSION]: (raw) => raw as LcalcFile,
};

export function migrateLcalcFile(raw: unknown): LcalcFile {
  if (!isRecord(raw) || typeof raw.schemaVersion !== "string" || raw.schemaVersion.length === 0) {
    throw new Error(unknownLcalcVersionMessage);
  }

  const schemaVersion = raw.schemaVersion;
  const migration = migrations[schemaVersion];

  if (!migration) {
    throw new Error(unsupportedLcalcVersionMessage(schemaVersion));
  }

  return migration(raw as LoadableLcalcFile);
}
