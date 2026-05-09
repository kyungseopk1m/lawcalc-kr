import type { LcalcFile } from "./ipc";

export type LcalcMigration = (raw: LcalcFile) => LcalcFile;
export type LcalcMigrationRegistry = Record<string, LcalcMigration>;

export const CURRENT_LCALC_SCHEMA_VERSION = "1";
export const unsupportedLcalcVersionMessage = (schemaVersion: string) =>
  `지원하지 않는 .lcalc 버전입니다: ${schemaVersion}`;

const migrations: LcalcMigrationRegistry = {
  [CURRENT_LCALC_SCHEMA_VERSION]: (raw) => raw,
};

export function migrateLcalcFile(raw: LcalcFile): LcalcFile {
  const migration = migrations[raw.schemaVersion];

  if (!migration) {
    throw new Error(unsupportedLcalcVersionMessage(raw.schemaVersion));
  }

  return migration(raw);
}
