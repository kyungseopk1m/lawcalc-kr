// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { HeirGroupCard, emptyHeir, type HeirInput } from "./inheritance-heirs";

/**
 * 상속인 입력 UI 의 DOM 렌더 테스트.
 *
 * 사망·결격과 포기를 동시에 체크하면 입력한 대습상속인이 결과에서만 조용히 사라지던 결함과,
 * 대습상속인 포기 체크박스가 아예 없어 그 정보가 든 파일을 되돌릴 수 없던 결함의 회귀 가드다.
 */
afterEach(cleanup);

/** 실제 상태 갱신까지 태워야 상호배타가 검증된다 (onChange 호출만 보면 tautology 다). */
function Harness({
  initial,
  onState,
}: {
  initial: HeirInput[];
  onState: (h: HeirInput[]) => void;
}) {
  const [heirs, setHeirs] = useState(initial);
  return (
    <HeirGroupCard
      title="직계비속"
      hint="테스트용"
      heirs={heirs}
      allowRepresentation
      defaultLabel="자녀"
      onChange={(next) => {
        setHeirs(next);
        onState(next);
      }}
    />
  );
}

const deceasedBox = () => screen.getByLabelText(/상속개시 전 사망·결격·상속권 상실/);
const renounceBox = () => screen.getAllByLabelText(/^상속포기/)[0]!;

describe("사망·결격과 상속포기의 상호배타", () => {
  it("포기를 체크하면 사망 체크와 대습 입력이 함께 지워진다", () => {
    const seen = vi.fn();
    render(
      <Harness
        initial={[
          {
            ...emptyHeir(),
            name: "자녀1",
            deceasedBeforeOpening: true,
            representatives: [{ id: "r1", name: "손자1" }],
          },
        ]}
        onState={seen}
      />,
    );
    expect(screen.getByDisplayValue("손자1")).toBeTruthy();

    fireEvent.click(renounceBox());

    const next = seen.mock.calls.at(-1)![0] as HeirInput[];
    expect(next[0]!.renounced).toBe(true);
    expect(next[0]!.deceasedBeforeOpening).toBe(false);
    expect(next[0]!.representatives).toEqual([]);
    // 화면에 남아 있는데 결과에서만 사라지는 대습자가 없어야 한다.
    expect(screen.queryByDisplayValue("손자1")).toBeNull();
  });

  it("사망을 체크하면 포기 체크가 풀린다", () => {
    const seen = vi.fn();
    render(
      <Harness initial={[{ ...emptyHeir(), name: "자녀1", renounced: true }]} onState={seen} />,
    );

    fireEvent.click(deceasedBox());

    const next = seen.mock.calls.at(-1)![0] as HeirInput[];
    expect(next[0]!.deceasedBeforeOpening).toBe(true);
    expect(next[0]!.renounced).toBe(false);
  });
});

describe("대습 원인과 대습상속인 포기 입력", () => {
  it("사망을 체크해야 대습 원인 선택이 나타난다", () => {
    const seen = vi.fn();
    render(<Harness initial={[{ ...emptyHeir(), name: "자녀1" }]} onState={seen} />);
    expect(screen.queryByLabelText(/대습 원인/)).toBeNull();

    fireEvent.click(deceasedBox());

    const cause: HTMLSelectElement = screen.getByLabelText(/대습 원인/);
    expect(cause.value).toBe("death");
    fireEvent.change(cause, { target: { value: "disqualified" } });
    expect((seen.mock.calls.at(-1)![0] as HeirInput[])[0]!.representationCause).toBe(
      "disqualified",
    );
  });

  it("대습상속인 행에서 그 사람의 상속포기를 체크할 수 있다", () => {
    const seen = vi.fn();
    render(
      <Harness
        initial={[
          {
            ...emptyHeir(),
            name: "자녀1",
            deceasedBeforeOpening: true,
            representatives: [{ id: "r1", name: "손자1" }],
          },
        ]}
        onState={seen}
      />,
    );

    // 종전에는 이 체크박스가 없어, renounced 가 담긴 파일을 열어도 화면에서 되돌릴 수 없었다.
    fireEvent.click(screen.getByLabelText(/이 대습상속인의 상속포기/));

    const next = seen.mock.calls.at(-1)![0] as HeirInput[];
    expect(next[0]!.representatives[0]!.renounced).toBe(true);
  });
});
