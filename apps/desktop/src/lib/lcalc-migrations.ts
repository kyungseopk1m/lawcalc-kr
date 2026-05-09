import type { LcalcFile, LcalcInterestPayload, LoadableLcalcFile } from "./ipc";

export type LcalcMigration = (raw: LoadableLcalcFile) => LcalcFile;
export type LcalcMigrationRegistry = Record<string, LcalcMigration>;

export const CURRENT_LCALC_SCHEMA_VERSION = "2";
export const unsupportedLcalcVersionMessage = (schemaVersion: string) =>
  `지원하지 않는 .lcalc 버전입니다: ${schemaVersion}`;

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

export function migrateLcalcFile(raw: LoadableLcalcFile): LcalcFile {
  const migration = migrations[raw.schemaVersion];

  if (!migration) {
    throw new Error(unsupportedLcalcVersionMessage(raw.schemaVersion));
  }

  return migration(raw);
}
