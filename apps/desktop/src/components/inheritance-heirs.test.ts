import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import {
  applyInheritanceInput,
  emptyHeir,
  fromHeirNode,
  hasInheritanceV2Fields,
  toHeirNode,
} from "./inheritance-heirs";
import { parseLoadedInheritanceLcalcInput } from "../lib/lcalc-validation";
import type { LcalcFile } from "../lib/ipc";

/**
 * INH-2 — 상속포기(`renounced`)의 UI 모델 ↔ 도메인 입력 ↔ `.lcalc` 왕복.
 *
 * 포기는 사망·결격과 별개 사유다(제1001조 대습원인에 포기가 없다). 어느 한 구간에서 필드가
 * 유실되면 사용자가 체크한 포기가 조용히 사라져 대습이 부활한다.
 */
describe("inheritance-heirs / renounced 왕복 [INH-2]", () => {
  it("toHeirNode 는 renounced 를 도메인 입력으로 옮긴다", () => {
    const node = toHeirNode({ ...emptyHeir(), name: "자녀A", renounced: true }, true);
    expect(node.renounced).toBe(true);
  });

  it("renounced 미체크면 필드를 만들지 않는다 (구파일과 동일한 모양)", () => {
    expect(toHeirNode({ ...emptyHeir(), name: "자녀A" }, true).renounced).toBeUndefined();
    expect(
      toHeirNode({ ...emptyHeir(), name: "자녀A", renounced: false }, true).renounced,
    ).toBeUndefined();
  });

  it("포기자에 대습자가 남아 있어도 사망이 아니면 대습을 만들지 않는다", () => {
    const node = toHeirNode(
      {
        ...emptyHeir(),
        name: "자녀A",
        renounced: true,
        representatives: [{ id: "r1", name: "손주" }],
      },
      true,
    );
    expect(node.renounced).toBe(true);
    expect(node.representatives).toBeUndefined();
  });

  it("대습상속인의 renounced 도 옮긴다", () => {
    const node = toHeirNode(
      {
        ...emptyHeir(),
        name: "자녀A",
        deceasedBeforeOpening: true,
        representatives: [
          { id: "r1", name: "손주1", renounced: true },
          { id: "r2", name: "손주2" },
        ],
      },
      true,
    );
    expect(node.representatives?.[0]?.renounced).toBe(true);
    expect(node.representatives?.[1]?.renounced).toBeUndefined();
  });

  it("fromHeirNode 는 renounced 를 UI 모델로 되돌린다", () => {
    const back = fromHeirNode({
      name: "자녀A",
      deceasedBeforeOpening: true,
      renounced: true,
      representatives: [{ name: "손주", deceasedBeforeOpening: false, renounced: true }],
    });
    expect(back.renounced).toBe(true);
    expect(back.representatives[0]?.renounced).toBe(true);
  });

  it("applyInheritanceInput 이 그룹 전체에서 renounced 를 살린다", () => {
    const state = applyInheritanceInput({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [{ name: "자녀A", deceasedBeforeOpening: false, renounced: true }],
      linealAscendants: [{ name: "부", deceasedBeforeOpening: false, renounced: true }],
      siblings: [{ name: "형제", deceasedBeforeOpening: false, renounced: true }],
      collateralFourth: [{ name: "삼촌", deceasedBeforeOpening: false, renounced: true }],
    });
    expect(state.linealDescendants[0]?.renounced).toBe(true);
    expect(state.linealAscendants[0]?.renounced).toBe(true);
    expect(state.siblings[0]?.renounced).toBe(true);
    expect(state.collateralFourth[0]?.renounced).toBe(true);
  });
});

describe("lcalc / renounced 파싱 [INH-2]", () => {
  const buildFile = (heir: Record<string, unknown>): LcalcFile =>
    ({
      schemaVersion: "3",
      kind: "inheritance",
      envelopeFeatures: ["inheritance@1"],
      dataVersions: { inheritance: "inheritance/v1.0.0" },
      payload: {
        appVersion: "0.11.0",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-08-18T00:00:00.000Z",
        input: {
          decedent: { deceasedAt: "2025-01-01" },
          spouse: { alive: true },
          linealDescendants: [heir],
        },
        disclaimer: STANDARD_DISCLAIMER,
      },
    }) as unknown as LcalcFile;

  it("renounced: true 를 유실 없이 읽는다", () => {
    const parsed = parseLoadedInheritanceLcalcInput(
      buildFile({ name: "자녀A", deceasedBeforeOpening: false, renounced: true }),
    );
    expect(parsed.input.linealDescendants?.[0]?.renounced).toBe(true);
  });

  it("renounced 없는 구파일은 종전대로 열린다", () => {
    const parsed = parseLoadedInheritanceLcalcInput(
      buildFile({ name: "자녀A", deceasedBeforeOpening: false }),
    );
    expect(parsed.input.linealDescendants?.[0]?.renounced).toBeUndefined();
  });

  it("renounced 가 boolean 이 아니면 거부한다", () => {
    expect(() =>
      parseLoadedInheritanceLcalcInput(
        buildFile({ name: "자녀A", deceasedBeforeOpening: false, renounced: "yes" }),
      ),
    ).toThrow(/renounced 필드는 true 또는 false/);
  });
});

/**
 * 대습 원인 (제1003조 제2항 2026-03-17 개정) 의 UI 모델 ↔ 도메인 입력 ↔ `.lcalc` 왕복.
 *
 * 어느 구간에서 유실되면 결격·상속권 상실이 사망으로 되돌아가, 시행일 이후 개시된 상속에서
 * 피대습자의 배우자에게 없는 지분이 생긴다.
 */
describe("inheritance-heirs / representationCause 왕복", () => {
  it("사망이 아닌 원인만 도메인 입력으로 옮긴다", () => {
    const heir = { ...emptyHeir(), name: "자녀A", deceasedBeforeOpening: true };
    expect(
      toHeirNode({ ...heir, representationCause: "disqualified" }, true).representationCause,
    ).toBe("disqualified");
    expect(
      toHeirNode({ ...heir, representationCause: "forfeited" }, true).representationCause,
    ).toBe("forfeited");
    // 기본값은 구파일과 같은 모양을 유지한다.
    expect(
      toHeirNode({ ...heir, representationCause: "death" }, true).representationCause,
    ).toBeUndefined();
    expect(toHeirNode(heir, true).representationCause).toBeUndefined();
  });

  it("사망·결격 체크가 없으면 원인을 붙이지 않는다", () => {
    const node = toHeirNode(
      { ...emptyHeir(), name: "자녀A", representationCause: "disqualified" },
      true,
    );
    expect(node.representationCause).toBeUndefined();
  });

  it("fromHeirNode 로 되살아난다", () => {
    const restored = fromHeirNode({
      name: "자녀A",
      deceasedBeforeOpening: true,
      representationCause: "forfeited",
    });
    expect(restored.representationCause).toBe("forfeited");
  });

  it("`.lcalc` 에서 읽고, 허용값이 아니면 거부한다", () => {
    const file = (cause: unknown): LcalcFile =>
      ({
        schemaVersion: "3",
        kind: "inheritance",
        envelopeFeatures: ["inheritance@2"],
        dataVersions: { inheritance: "inheritance/v1.0.0" },
        payload: {
          appVersion: "0.12.0",
          dataVersion: "inheritance/v1.0.0",
          createdAt: "2026-08-18T00:00:00.000Z",
          input: {
            decedent: { deceasedAt: "2026-04-01" },
            linealDescendants: [
              {
                name: "자녀A",
                deceasedBeforeOpening: true,
                representationCause: cause,
                representatives: [{ name: "손주", deceasedBeforeOpening: false }],
              },
            ],
          },
          disclaimer: STANDARD_DISCLAIMER,
        },
      }) as unknown as LcalcFile;

    expect(
      parseLoadedInheritanceLcalcInput(file("disqualified")).input.linealDescendants?.[0]
        ?.representationCause,
    ).toBe("disqualified");
    expect(() => parseLoadedInheritanceLcalcInput(file("renounced"))).toThrow(
      /representationCause/,
    );
  });
});

/** 신파일을 구앱이 열면 조용히 다른 금액이 나오므로, 새 의미 필드가 붙으면 @2 를 요구한다. */
describe("hasInheritanceV2Fields", () => {
  const base = { decedent: { deceasedAt: "2026-04-01" } };

  it("포기 또는 사망 아닌 대습 원인이 있으면 true", () => {
    expect(
      hasInheritanceV2Fields({
        ...base,
        linealDescendants: [{ name: "자녀A", deceasedBeforeOpening: false, renounced: true }],
      }),
    ).toBe(true);
    expect(
      hasInheritanceV2Fields({
        ...base,
        linealDescendants: [
          {
            name: "자녀A",
            deceasedBeforeOpening: true,
            representationCause: "disqualified",
            representatives: [{ name: "손주", deceasedBeforeOpening: false }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("대습상속인 쪽 포기도 잡는다", () => {
    expect(
      hasInheritanceV2Fields({
        ...base,
        linealDescendants: [
          {
            name: "자녀A",
            deceasedBeforeOpening: true,
            representatives: [{ name: "손주", deceasedBeforeOpening: false, renounced: true }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("구파일과 같은 입력이면 false (구앱이 계속 열 수 있어야 한다)", () => {
    expect(
      hasInheritanceV2Fields({
        ...base,
        linealDescendants: [
          {
            name: "자녀A",
            deceasedBeforeOpening: true,
            representatives: [{ name: "손주", deceasedBeforeOpening: false }],
          },
          { name: "자녀B", deceasedBeforeOpening: false },
        ],
      }),
    ).toBe(false);
  });
});
