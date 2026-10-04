// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PercentInput } from "./PercentInput";

afterEach(cleanup);

describe("PercentInput", () => {
  it("7.5 를 한 글자씩 입력해도 0.075 로 저장되고 중간 표시가 부동소수 오차로 바뀌지 않는다", () => {
    let saved = 0;
    const Harness = () => {
      const [rate, setRate] = useState(0);
      return (
        <PercentInput
          aria-label="이율"
          value={rate}
          onValueChange={(r) => {
            saved = r;
            setRate(r);
          }}
        />
      );
    };
    render(<Harness />);
    const input = screen.getByLabelText<HTMLInputElement>("이율");

    fireEvent.change(input, { target: { value: "7" } });
    // 왕복 방식이면 여기서 7.000000000000001 로 되돌아온다.
    expect(input.value).toBe("7");
    expect(saved).toBe(0.07);

    fireEvent.change(input, { target: { value: "7.5" } });
    expect(input.value).toBe("7.5");
    expect(saved).toBe(0.075);
  });

  it("외부에서 값이 바뀌면(초기화) 입력 표시도 따라간다", () => {
    const { rerender } = render(
      <PercentInput aria-label="이율" value={0.12} onValueChange={() => {}} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("이율");
    expect(input.value).toBe("12");
    rerender(<PercentInput aria-label="이율" value={0} onValueChange={() => {}} />);
    expect(input.value).toBe("");
  });
});
