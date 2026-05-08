import type { ChangeEvent } from "react";

import { Input } from "../ui/input";

interface PrincipalInputProps {
  value: number;
  error?: string;
  onChange: (value: number) => void;
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

function parsePrincipal(value: string) {
  const normalized = value.replaceAll(",", "").replace(/[^\d]/g, "");
  return normalized.length > 0 ? Number(normalized) : 0;
}

export function PrincipalInput({ value, error, onChange }: PrincipalInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(parsePrincipal(event.target.value));
  };

  return (
    <label className="grid gap-2 text-sm font-medium">
      원금
      <Input
        aria-invalid={Boolean(error)}
        inputMode="numeric"
        placeholder="예: 10,000,000"
        value={value > 0 ? numberFormatter.format(value) : ""}
        onChange={handleChange}
      />
      {error ? <span className="text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}
