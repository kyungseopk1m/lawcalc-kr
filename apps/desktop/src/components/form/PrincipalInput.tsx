import type { ChangeEvent } from "react";

import { formatWonInput, parseWonAmount } from "../../lib/format-won";
import { Input } from "../ui/input";

interface PrincipalInputProps {
  value: number;
  error?: string;
  onChange: (value: number) => void;
}

export function PrincipalInput({ value, error, onChange }: PrincipalInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(parseWonAmount(event.target.value, 0));
  };
  const errorId = "principal-error";

  return (
    <label className="grid gap-2 text-sm font-medium">
      원금
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        inputMode="numeric"
        placeholder="예: 10,000,000"
        value={value > 0 ? formatWonInput(String(value)) : ""}
        onChange={handleChange}
      />
      {error ? (
        <span id={errorId} className="text-xs font-normal text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
