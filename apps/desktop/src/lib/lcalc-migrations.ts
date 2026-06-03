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

function normalizeLegacyLawyerFeeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLegacyLawyerFeeValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "klacAgreedFeeWon") {
      normalized.koreaLegalAidAgreedFeeWon = child;
      continue;
    }
    if (key === "klacWarnings") {
      normalized.koreaLegalAidWarnings = normalizeLegacyLawyerFeeValue(child);
      continue;
    }
    normalized[key] = normalizeLegacyLawyerFeeValue(child);
  }

  if (normalized.kind === "klac") {
    normalized.kind = "koreaLegalAid";
  }
  if (normalized.reason === "klacScopeNotCivilOrFamily") {
    normalized.reason = "koreaLegalAidScopeNotCivilOrFamily";
  } else if (normalized.reason === "klacScopeOverridden") {
    normalized.reason = "koreaLegalAidScopeOverridden";
  }
  if (typeof normalized.messageKo === "string") {
    normalized.messageKo = normalized.messageKo
      .replaceAll("KLAC 적용", "대한법률구조공단 적용")
      .replaceAll("KLAC variant", "대한법률구조공단 variant");
  }
  if (typeof normalized.formulaText === "string") {
    normalized.formulaText = normalized.formulaText
      .replaceAll("KLAC (대한법률구조공단, ×0.42 default)", "대한법률구조공단 (×0.42 default)")
      .replaceAll("KLAC", "대한법률구조공단");
  }

  return normalized;
}

function normalizeV3LitigationCostFile(raw: LcalcFile): LcalcFile {
  if (raw.kind !== "litigation-cost") {
    return raw;
  }
  return normalizeLegacyLawyerFeeValue(raw) as LcalcFile;
}

/**
 * compensation intra-v3 normalize: `@1` (자×부상) → `@2` (자×부상 + 자×사망) → `@3` (+ 산재).
 *
 * - `@1 → @2`: v0.5.x 가 저장한 자×부상 파일은 `input.mode` discriminator 가 없다. v0.6.0 부터
 *   같은 `kind: "compensation"` envelope 가 자×사망(`mode: "death"`) 도 담으므로, `mode: "injury"`
 *   를 명시 주입해 reader 분기를 견고하게 한다.
 * - `@2 → @3`: v0.6.x 까지의 파일은 `input.accidentType` 이 없다. v0.7.0 부터 산재(산×부상/산×사망)
 *   가 합류하므로 기존 자동차 파일에 `accidentType: "auto"` 를 명시 주입한다. 이미 산재 파일
 *   (`accidentType: "industrial"`)은 변경하지 않는다.
 *
 * 나머지 필드는 그대로 보존하며, 이미 정규화된 파일은 그대로 둔다 (byte 변경 최소).
 */
function normalizeV3CompensationFile(raw: LcalcFile): LcalcFile {
  if (raw.kind !== "compensation") {
    return raw;
  }
  const input: unknown = raw.payload.input;
  if (!isRecord(input)) {
    return raw;
  }
  let nextInput: Record<string, unknown> = input;
  if (nextInput.mode === undefined) {
    nextInput = { mode: "injury", ...nextInput };
  }
  if (nextInput.accidentType === undefined) {
    nextInput = { accidentType: "auto", ...nextInput };
  }
  // 이미 정규화된 파일(mode·accidentType 둘 다 존재)은 nextInput 이 원본 input 참조 그대로이므로
  // raw 를 손대지 않고 반환해 byte-identity 를 보장한다. nextInput 을 무조건 재할당하지 말 것.
  if (nextInput === input) {
    return raw;
  }
  return {
    ...raw,
    payload: {
      ...raw.payload,
      input: nextInput,
    },
  } as unknown as LcalcFile;
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
      return normalizeV3CompensationFile(normalizeV3LitigationCostFile(current as LcalcFile));
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
