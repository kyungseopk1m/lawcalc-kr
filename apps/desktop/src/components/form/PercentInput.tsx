import { useState, type InputHTMLAttributes } from "react";

import { Input } from "../ui/input";

type PercentInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** 저장 단위 비율 (0.075 = 7.5%) */
  value: number;
  onValueChange: (rate: number) => void;
};

const toText = (rate: number) => (rate > 0 ? String(Number((rate * 100).toFixed(10))) : "");

/**
 * 퍼센트 입력. 저장 단위(0.07)와 표시 단위(7)를 왕복하면 7 → 0.07 → 7.000000000000001 로 돌아와
 * 다음 글자("7.5")가 7.0000000000000015 가 되므로, 입력 중 문자열을 로컬로 들고 있다가 값만 올린다.
 * 외부에서 값이 바뀌면(불러오기·초기화) 그 값으로 다시 맞춘다.
 */
export function PercentInput({ value, onValueChange, ...props }: PercentInputProps) {
  const [text, setText] = useState(() => toText(value));
  const shown = (text === "" ? 0 : Number(text) / 100) === value ? text : toText(value);
  return (
    <Input
      {...props}
      inputMode="decimal"
      type="number"
      value={shown}
      onChange={(event) => {
        setText(event.target.value);
        onValueChange(Number(event.target.value) / 100);
      }}
    />
  );
}
