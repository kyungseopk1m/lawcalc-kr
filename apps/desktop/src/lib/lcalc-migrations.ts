import type { LcalcFile, LcalcInterestPayload, LoadableLcalcFile } from "./ipc";

export type LcalcMigration = (raw: LoadableLcalcFile) => LoadableLcalcFile;
export type LcalcMigrationRegistry = Record<string, LcalcMigration>;

export const CURRENT_LCALC_SCHEMA_VERSION = "3";
export const unsupportedLcalcVersionMessage = (schemaVersion: string) =>
  `지원하지 않는 .lcalc 버전입니다: ${schemaVersion}`;
const unknownLcalcVersionMessage =
  ".lcalc 파일 형식을 확인할 수 없습니다. 파일이 손상되었거나 다른 프로그램이 만든 파일일 수 있습니다.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateV1ToV2(
  raw: Extract<LoadableLcalcFile, { schemaVersion: "1" }>,
): Extract<LoadableLcalcFile, { schemaVersion: "2" }> {
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
    schemaVersion: "2",
    kind: "interest",
    payload,
  };
}

function migrateV2ToV3(raw: Extract<LoadableLcalcFile, { schemaVersion: "2" }>): LcalcFile {
  // capability id 와 dataVersions 키는 모두 kind 와 일치하도록 hoist 한다.
  // payload.dataVersion 은 backward compat 위해 그대로 보존하며, v3 부터는
  // envelope-level dataVersions 가 source-of-truth.
  if (raw.kind === "interest") {
    return {
      schemaVersion: "3",
      kind: "interest",
      envelopeFeatures: ["interest@1"],
      dataVersions: { interest: raw.payload.dataVersion },
      payload: raw.payload,
    };
  }
  return {
    schemaVersion: "3",
    kind: "inheritance",
    envelopeFeatures: ["inheritance@1"],
    dataVersions: { inheritance: raw.payload.dataVersion },
    payload: raw.payload,
  };
}

const migrations: LcalcMigrationRegistry = {
  "1": (raw) => migrateV1ToV2(raw as Extract<LoadableLcalcFile, { schemaVersion: "1" }>),
  "2": (raw) => migrateV2ToV3(raw as Extract<LoadableLcalcFile, { schemaVersion: "2" }>),
};

const MAX_MIGRATION_HOPS = 8;

export function migrateLcalcFile(raw: unknown): LcalcFile {
  let current: unknown = raw;
  for (let i = 0; i < MAX_MIGRATION_HOPS; i += 1) {
    if (
      !isRecord(current) ||
      typeof current.schemaVersion !== "string" ||
      current.schemaVersion.length === 0
    ) {
      throw new Error(unknownLcalcVersionMessage);
    }

    const schemaVersion = current.schemaVersion;
    if (schemaVersion === CURRENT_LCALC_SCHEMA_VERSION) {
      return current as LcalcFile;
    }

    const migration = migrations[schemaVersion];
    if (!migration) {
      throw new Error(unsupportedLcalcVersionMessage(schemaVersion));
    }

    current = migration(current as LoadableLcalcFile);
  }

  // unreachable in practice — 등록된 migration 이 cycle 을 만들지 않는 한
  // chain 깊이가 MAX_MIGRATION_HOPS 미만에서 종료된다.
  throw new Error(unknownLcalcVersionMessage);
}
