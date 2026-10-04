// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LitigationCostCalculator } from "./LitigationCostCalculator";

/**
 * 소송비용 탭의 DOM 렌더 테스트.
 *
 * 이 저장소에는 렌더 테스트가 없어서 "타입·엔진에는 있는데 화면에 배선되지 않은" 결함을
 * 단위 테스트가 잡지 못했다 (항고 인지액 UI 미배선, 초기화 누락, 조정 심급 제한). 그 공백을
 * 메우는 첫 그물이다. role·label 질의를 우선한다.
 */
afterEach(cleanup);

const caseValueInput = (): HTMLInputElement => screen.getByLabelText("소가");
const appealScopeInput = (): HTMLInputElement => screen.getByLabelText("항소·상고 불복 범위");
const basisSelect = (): HTMLSelectElement => screen.getByLabelText(/소가 산정 기준/);
// 청구변경신청 패널에도 "청구변경 심급" 이 있어 정규식은 두 개를 잡는다. 이 헬퍼가 가리키는
// 것은 본 계산기 본체의 심급이므로 정확히 일치시킨다.
const levelSelect = (): HTMLSelectElement => screen.getByLabelText("심급");
const caseTypeSelect = (): HTMLSelectElement => screen.getByLabelText(/사건구분/);

describe("소가 산정 기준 (인지규칙 제18조의2)", () => {
  it("간주 소가를 고르면 소가와 불복 범위가 모두 비활성이 된다", () => {
    render(<LitigationCostCalculator />);
    expect(caseValueInput().disabled).toBe(false);

    fireEvent.change(basisSelect(), { target: { value: "unascertainable" } });

    // 엔진이 소가를 통째로 대체하므로 둘 다 편집해도 결과가 바뀌지 않는다.
    expect(caseValueInput().disabled).toBe(true);
    expect(appealScopeInput().disabled).toBe(true);
    expect(screen.getByText(/제18조의2에 따라 소가를 간주/)).toBeTruthy();
  });

  it("Esc 초기화가 소가 산정 기준까지 되돌린다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(basisSelect(), { target: { value: "unascertainable" } });
    expect(basisSelect().value).toBe("unascertainable");

    // 초기화는 입력 필드 밖에서 Esc 두 번. 되돌리지 않으면 기본 화면에서 230,000원이 계산된다.
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(basisSelect().value).toBe("amount");
    expect(caseValueInput().disabled).toBe(false);
  });
});

describe("사건구분에 따른 입력 노출", () => {
  it("민사조정은 심급을 고를 수 없다", () => {
    render(<LitigationCostCalculator />);
    expect(levelSelect().disabled).toBe(false);

    fireEvent.change(caseTypeSelect(), { target: { value: "civilMediation" } });

    // 조정신청에는 상소 수수료가 없다 (민사조정규칙 제3조).
    expect(levelSelect().disabled).toBe(true);
    expect(appealScopeInput().disabled).toBe(true);
  });

  it("항고 사건에서만 원신청서 인지액 입력이 나타난다", () => {
    render(<LitigationCostCalculator />);
    expect(screen.queryByLabelText(/원신청서 인지액/)).toBeNull();

    fireEvent.change(caseTypeSelect(), { target: { value: "civilInterlocutoryAppeal" } });

    // 엔진에만 있고 UI 에 배선되지 않아 제11조 제1항을 화면에서 계산할 수 없던 결함.
    expect(screen.getByLabelText(/원신청서 인지액/)).toBeTruthy();
  });
});

describe("확장 사건구분 (2026-08-27)", () => {
  it("도산 사건을 고르면 채권자수 입력이 뜨고 인지 산출 외 안내가 나온다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(caseTypeSelect(), { target: { value: "rehabilitationIndividual" } });
    expect(screen.getByLabelText(/채권자수/)).toBeTruthy();
    expect(screen.getByText(/누진 산식 대상이 아닙니다/)).toBeTruthy();
  });

  it("재산조회를 고르면 조회대상 기관수 입력이 뜬다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(caseTypeSelect(), { target: { value: "executionAssetInquiry" } });
    expect(screen.getByLabelText(/우편 조회대상 기관수/)).toBeTruthy();
  });

  it("송달 횟수가 범위인 사건은 직접 입력란이 뜬다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(caseTypeSelect(), { target: { value: "familyRuiPetition" } });
    expect(screen.getByLabelText(/송달 횟수 직접 입력/)).toBeTruthy();
  });

  it("민사 1심에는 도산·집행 전용 입력이 뜨지 않는다", () => {
    render(<LitigationCostCalculator />);
    expect(screen.queryByLabelText(/채권자수/)).toBeNull();
    expect(screen.queryByLabelText(/우편 조회대상 기관수/)).toBeNull();
    expect(screen.queryByLabelText(/송달 횟수 직접 입력/)).toBeNull();
  });
});

describe("소가 계산 · 청구변경신청 보조 패널", () => {
  it("인지 대상 사건에서는 두 패널이 모두 배선되어 있다", () => {
    render(<LitigationCostCalculator />);
    expect(screen.getByText(/부동산 소가 계산/)).toBeTruthy();
    expect(screen.getByText(/청구변경신청 인지액/)).toBeTruthy();
  });

  it("인지 산출 외 사건구분에서는 두 패널이 사라진다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(caseTypeSelect(), { target: { value: "fineObjection" } });
    expect(screen.queryByText(/부동산 소가 계산/)).toBeNull();
    expect(screen.queryByText(/청구변경신청 인지액/)).toBeNull();
  });

  it("소가 계산 결과를 소가 입력란에 적용한다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(screen.getByLabelText(/목적물 가액/), {
      target: { value: "300,000,000" },
    });
    fireEvent.change(screen.getByLabelText(/소의 종류/), {
      target: { value: "deliveryByOwnership" },
    });
    fireEvent.click(screen.getByRole("button", { name: "소가에 적용" }));
    // 3억 × 1/2 = 1.5억
    expect(caseValueInput().value).toBe("150,000,000");
  });
});

describe("인지 산출 외 사건구분의 입력 비활성", () => {
  const caseValue = (): HTMLInputElement => screen.getByLabelText("소가");
  const electronicFiling = (): HTMLInputElement => screen.getByLabelText("전자소송");

  it("도산 사건을 고르면 인지대 관련 입력이 모두 잠긴다", () => {
    render(<LitigationCostCalculator />);
    expect(caseValue().disabled).toBe(false);
    expect(levelSelect().disabled).toBe(false);
    fireEvent.change(caseTypeSelect(), { target: { value: "rehabilitationIndividual" } });
    // 금액을 넣을 수 있는 채로 두면 인지대 0원이 계산 오류로 읽힌다.
    expect(caseValue().disabled).toBe(true);
    expect(basisSelect().disabled).toBe(true);
    expect(levelSelect().disabled).toBe(true);
    expect(electronicFiling().disabled).toBe(true);
  });

  it("민사 1심으로 돌아오면 다시 열린다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(caseTypeSelect(), { target: { value: "fineObjection" } });
    expect(caseValue().disabled).toBe(true);
    fireEvent.change(caseTypeSelect(), { target: { value: "civilFirstInstanceSingle" } });
    expect(caseValue().disabled).toBe(false);
    expect(levelSelect().disabled).toBe(false);
  });
});

describe("소가 계산의 기준 가액 표시", () => {
  const kindSelect = (): HTMLSelectElement => screen.getByLabelText("소의 종류");

  it("지역권을 고르면 가액 입력란 이름이 승역지 가액으로 바뀐다", () => {
    render(<LitigationCostCalculator />);
    // 무엇의 가액을 넣어야 하는지가 화면에 없으면 요역지 가액을 넣고도 맞다고 읽는다.
    expect(screen.getByLabelText("목적물 가액")).toBeTruthy();
    fireEvent.change(kindSelect(), { target: { value: "easementConfirmation" } });
    expect(screen.getByLabelText("승역지 가액")).toBeTruthy();
    expect(screen.queryByLabelText("목적물 가액")).toBeNull();
  });

  it("담보물권을 고르면 피담보채권액 입력이 나타난다", () => {
    render(<LitigationCostCalculator />);
    // 안내 문구가 라벨 안에 들어 있어 정확 일치로는 잡히지 않는다. 라벨 첫머리로 좁힌다.
    expect(screen.queryByLabelText(/^피담보채권액/)).toBeNull();
    fireEvent.change(kindSelect(), { target: { value: "securityRightConfirmation" } });
    expect(screen.getByLabelText(/^피담보채권액/)).toBeTruthy();
  });
});

describe("숫자 칸 (공용 파서)", () => {
  const partyCountInput = (): HTMLInputElement => screen.getByLabelText("당사자수");
  const calculate = () => fireEvent.click(screen.getByRole("button", { name: "계산" }));

  it('당사자수 "10명" 은 10명으로 계산한다 (1명으로 바꾸지 않는다)', () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(partyCountInput(), { target: { value: "10명" } });
    calculate();

    // 민사 1심 단독: 당사자수 × 15회 × 5,640원 (송달료 데이터셋). 1명으로 읽으면 84,600원.
    expect(screen.getByText("846,000원")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("읽지 못한 당사자수는 칸 옆 오류를 내고 계산하지 않는다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(partyCountInput(), { target: { value: "열명" } });

    expect(screen.getByText(/숫자로 입력하세요/)).toBeTruthy();
    calculate();
    expect(screen.getByText(/당사자수: 숫자로 입력하세요/)).toBeTruthy();
    expect(screen.queryByText("계산 결과")).toBeNull();
  });

  it("소가를 비우면 0원으로 계산하지 않고 오류를 낸다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(caseValueInput(), { target: { value: "" } });
    expect(screen.getByText("소가를 입력하세요.")).toBeTruthy();
    calculate();
    expect(screen.getByText(/소가: 소가를 입력하세요/)).toBeTruthy();
    expect(screen.queryByText("계산 결과")).toBeNull();
  });
});
