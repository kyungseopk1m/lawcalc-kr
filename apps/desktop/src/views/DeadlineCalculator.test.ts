import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type { LcalcFile } from "../lib/ipc";
import { parseLoadedDeadlineLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import {
  applyLoadedDeadlineInput,
  buildDeadlineLcalcFile,
  buildDeadlineTabInput,
  computeDeadlineOutcome,
  emptyDeadlineForm,
  formatDeadlineForClipboard,
  hasJustCauseCaveat,
  type DeadlineFormState,
} from "./DeadlineCalculator";

const FIXED_NOW = "2026-09-04T00:00:00.000Z";

function form(overrides: Partial<DeadlineFormState> = {}): DeadlineFormState {
  return {
    id: "civilAppeal",
    startEventDate: "2026-09-04",
    useAlternate: false,
    ...overrides,
  };
}

function outcome(state: DeadlineFormState) {
  return computeDeadlineOutcome(buildDeadlineTabInput(state), FIXED_NOW);
}

type DeadlineLcalcFile = Extract<LcalcFile, { kind: "deadline" }>;

/** `.lcalc` envelope 를 deadline 분기로 좁혀 돌려준다. 좁히지 않으면 payload 가 union 이다. */
function deadlineLcalcFile(state: DeadlineFormState, note = ""): DeadlineLcalcFile {
  const input = buildDeadlineTabInput(state);
  const file = buildDeadlineLcalcFile(input, computeDeadlineOutcome(input, FIXED_NOW), note);
  if (file.kind !== "deadline") throw new Error("deadline envelope 가 아닙니다");
  return file;
}

describe("buildDeadlineTabInput", () => {
  it("대체 기간이 없는 항목에는 useAlternate 를 싣지 않는다", () => {
    // 대체 기간을 켠 채 다른 항목으로 옮기면 엔진이 RangeError 를 던진다. 그건 사용자의
    // 입력 오류가 아니라 화면이 남긴 찌꺼기라 여기서 걸러야 한다.
    expect(buildDeadlineTabInput(form({ useAlternate: true }))).toEqual({
      id: "civilAppeal",
      startEventDate: "2026-09-04",
    });
  });

  it("대체 기간이 있는 항목에서만 useAlternate 를 싣는다", () => {
    const input = buildDeadlineTabInput(
      form({ id: "adminAppealForceMajeure", useAlternate: true }),
    );
    expect(input.useAlternate).toBe(true);
    expect(computeDeadlineOutcome(input, FIXED_NOW).lengthTextKo).toBe("30일");
    expect(computeDeadlineOutcome(input, FIXED_NOW).appliedAlternateKo).toBe(
      "국외에서 행정심판을 청구하는 경우",
    );
  });
});

describe("applyLoadedDeadlineInput", () => {
  it("왕복: build → apply 시 화면 상태가 그대로 복원된다", () => {
    const original = form({ id: "lateActSupplement", startEventDate: "2027-01-15" });
    expect(applyLoadedDeadlineInput(buildDeadlineTabInput(original))).toEqual(original);
  });

  it("useAlternate 가 빠진 파일은 false 로 복원한다 (엔진 기본값과 같다)", () => {
    expect(
      applyLoadedDeadlineInput({ id: "civilAppeal", startEventDate: "2026-09-04" }).useAlternate,
    ).toBe(false);
  });
});

describe("computeDeadlineOutcome", () => {
  it("민사 항소는 송달일 기산 2주이고 말일 조정 근거가 민법 제161조다", () => {
    const result = outcome(form({ startEventDate: "2026-09-05" }));
    expect(result.startEventKo).toBe("판결서를 송달받은 날");
    expect(result.lengthTextKo).toBe("2주");
    expect(result.period.startDate).toBe("2026-09-06");
    expect(result.period.rawExpiry).toBe("2026-09-19");
    expect(result.expiryDate).toBe("2026-09-21");
    expect(result.holidayRollover.status).toBe("applied");
    expect(result.holidayRollover.basisKo).toContain("민법 제161조");
    expect(result.immutable).toBe("yes");
  });

  it("형사 항소는 선고·고지일 기산 7일이고 말일 조정 근거가 형사소송법이다", () => {
    const result = outcome(form({ id: "criminalAppeal", startEventDate: "2026-09-05" }));
    expect(result.lawNameKo).toBe("형사소송법");
    expect(result.startEventKo).toBe("재판을 선고 또는 고지한 날");
    expect(result.expiryDate).toBe("2026-09-14");
    expect(result.holidayRollover.basisKo).toBe("형사소송법 제66조 제3항");
    expect(result.periodRuleKo.firstDay).toContain("형사소송법 제66조 제1항");
    expect(result.periodRuleKo.endOfPeriod).toContain("형사소송법 제66조");
    // 형사 계열의 기간 규칙 근거에 민법이 섞이면 안 된다.
    expect(result.periodRuleKo.firstDay).not.toContain("민법");
    expect(result.periodRuleKo.endOfPeriod).not.toContain("민법");
    expect(result.holidayRollover.basisKo).not.toContain("민법");
  });

  it("커버리지 밖 만료일은 만료일을 내되 말일 조정은 판정하지 않는다", () => {
    const result = outcome(form({ startEventDate: "2027-12-25" }));
    expect(result.expiryDate).toBe("2028-01-08");
    expect(result.period.rawExpiry).toBe("2028-01-08");
    expect(result.holidayRollover.status).toBe("outOfCoverage");
  });

  it("가사 계열은 불변기간 여부를 unstated 로 남긴다", () => {
    const result = outcome(form({ id: "familyAppeal" }));
    expect(result.immutable).toBe("unstated");
    expect(result.immutableLabelKo).toBe("법령에 표시 없음");
    expect(result.immutableLabelKo).not.toBe("불변기간 아님");
  });

  it("두 데이터셋 버전을 모두 싣는다", () => {
    const result = outcome(form());
    expect(result.dataVersion).toMatch(/^deadlines\/v/);
    expect(result.holidaysVersion).toMatch(/^holidays\/v/);
  });

  it("없는 기한 id 는 한국어 오류로 거절한다", () => {
    expect(() => outcome(form({ id: "patentAppeal" }))).toThrow(/patentAppeal/);
  });
});

describe("산출 근거", () => {
  /**
   * 형사 기간은 형사소송법 제66조가 정하므로 민법 조문이 근거로 뜨면 안 된다. 종전에는
   * 기간 엔진이 계열을 가리지 않고 민법 조문을 박았고 화면이 그것을 피해 가는 방식이었다.
   * 지금은 엔진이 계열에 맞는 조문을 쓰므로, 화면에 실리는 값 전체를 훑어 확인한다.
   */
  it("형사 항목의 어느 표시 필드에도 민법 조문이 새지 않는다", () => {
    const result = outcome(form({ id: "criminalAppeal", startEventDate: "2026-09-05" }));
    const shown = JSON.stringify(result);
    expect(shown).not.toMatch(/민법/);
    expect(result.period.formulaText).toContain("형사소송법");
    expect(result.formulaText).not.toMatch(/제1[567]\d조/);
    expect(result.formulaText).toContain("재판을 선고 또는 고지한 날 2026-09-05");
    expect(result.formulaText).toContain("만료일 2026-09-14");
  });

  it("민사 항목에는 그대로 민법이 근거로 나온다", () => {
    const result = outcome(form({ id: "civilAppeal", startEventDate: "2026-09-05" }));
    expect(JSON.stringify(result)).not.toMatch(/형사소송법/);
    expect(result.periodRuleKo.firstDay).toContain("민법 제157조");
  });
});

describe("hasJustCauseCaveat", () => {
  it("정당한 사유 단서가 붙은 두 기한을 잡는다", () => {
    expect(hasJustCauseCaveat(outcome(form({ id: "revocationSuitOuterLimit" })))).toBe(true);
    expect(hasJustCauseCaveat(outcome(form({ id: "adminAppealOuterLimit" })))).toBe(true);
  });

  it("단서가 없는 기한에는 붙지 않는다", () => {
    expect(hasJustCauseCaveat(outcome(form()))).toBe(false);
    expect(hasJustCauseCaveat(outcome(form({ id: "criminalAppeal" })))).toBe(false);
  });
});

describe("formatDeadlineForClipboard + buildDeadlineLcalcFile", () => {
  it("clipboard 본문은 STANDARD_DISCLAIMER 로 끝난다", () => {
    const text = formatDeadlineForClipboard(outcome(form()));
    expect(text).toContain("LawCalc Korea 불변기한 계산 결과");
    expect(text).toContain("불변기간: 불변기간");
    expect(text.trim().endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("정당한 사유 단서가 있으면 clipboard 에도 경고가 실린다", () => {
    const text = formatDeadlineForClipboard(outcome(form({ id: "adminAppealOuterLimit" })));
    expect(text).toContain("정당한 사유");
  });

  it("lcalc envelope 는 v3 + deadline kind + deadline@1 capability", () => {
    const file = deadlineLcalcFile(form(), "비고 메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("deadline");
    expect(file.envelopeFeatures).toEqual(["deadline@1"]);
    expect(file.dataVersions.deadlines).toBe(file.payload.result?.dataVersion);
    expect(file.dataVersions.holidays).toBe(file.payload.result?.holidaysVersion);
    expect(file.payload.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.result?.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.note).toBe("비고 메모");
  });
});

/**
 * 저장 → 검증 → 로드 왕복. 파서가 입력 필드 하나를 빠뜨리면 throw 없이 조용히 기본값으로
 * 되돌아가므로, 화면 상태까지 되돌려서 같은지 본다.
 */
describe(".lcalc 저장 → 열기 왕복", () => {
  it("모든 입력이 살아남는다", () => {
    const original = form({
      id: "adminAppealForceMajeure",
      startEventDate: "2026-02-10",
      useAlternate: true,
    });
    const file = deadlineLcalcFile(original, "메모");

    const serialized = JSON.parse(JSON.stringify(file)) as DeadlineLcalcFile;
    validateLcalcEnvelope(serialized);
    const loaded = parseLoadedDeadlineLcalcInput(serialized);

    expect(applyLoadedDeadlineInput(loaded.input)).toEqual(original);
    expect(loaded.note).toBe("메모");
    expect(loaded.result?.appliedAlternateKo).toBe("국외에서 행정심판을 청구하는 경우");
  });

  it("없는 기한 id 는 조용히 넘기지 않고 한국어 오류로 거절한다", () => {
    const broken = JSON.parse(JSON.stringify(deadlineLcalcFile(form()))) as DeadlineLcalcFile;
    broken.payload.input.id = "patentAppeal";
    expect(() => validateLcalcEnvelope(broken)).toThrow(/patentAppeal/);
  });

  it("대체 기간이 없는 항목의 useAlternate 는 거절한다", () => {
    const broken = JSON.parse(JSON.stringify(deadlineLcalcFile(form()))) as DeadlineLcalcFile;
    broken.payload.input.useAlternate = true;
    expect(() => validateLcalcEnvelope(broken)).toThrow(/대체 기간/);
  });

  it("두 데이터셋 태그 중 하나라도 빠지면 거절한다", () => {
    const broken = JSON.parse(JSON.stringify(deadlineLcalcFile(form()))) as DeadlineLcalcFile;
    delete broken.dataVersions.deadlines;
    expect(() => validateLcalcEnvelope(broken)).toThrow(/deadlines/);
  });

  it("미지원 capability 는 envelope 단계에서 거절한다", () => {
    const future = JSON.parse(JSON.stringify(deadlineLcalcFile(form()))) as DeadlineLcalcFile;
    future.envelopeFeatures = ["deadline@9"];
    expect(() => validateLcalcEnvelope(future)).toThrow(/deadline@9/);
  });

  it("다른 도메인 파일은 탭을 알려주며 거절한다", () => {
    const foreign = JSON.parse(JSON.stringify(deadlineLcalcFile(form()))) as LcalcFile;
    expect(() =>
      parseLoadedDeadlineLcalcInput({ ...foreign, kind: "period" } as LcalcFile),
    ).toThrow(/기간 계산 탭/);
  });
});

describe("emptyDeadlineForm", () => {
  it("초기 상태는 데이터셋 첫 항목 + 대체 기간 꺼짐", () => {
    const initial = emptyDeadlineForm();
    expect(initial.id).toBe("civilAppeal");
    expect(initial.useAlternate).toBe(false);
  });
});
