import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { formatWonInput, parseWonText } from "../../lib/format-won";
import { cn } from "../../lib/utils";

const SEPARATOR_REGEX = /(?:,\s+|\s+|\/)+/;
const JOIN_SEPARATOR = " / ";

export function parsePillTokens(text: string): string[] {
  return text
    .split(SEPARATOR_REGEX)
    .map((part) => parseWonText(part))
    .filter((token) => token.length > 0 && token !== "0");
}

export function appendPillToken(text: string, rawInput: string): string {
  const digits = parseWonText(rawInput);
  if (digits.length === 0 || digits === "0") return text;
  const existing = parsePillTokens(text);
  return [...existing, digits].join(JOIN_SEPARATOR);
}

export function removePillTokenAt(text: string, index: number): string {
  const tokens = parsePillTokens(text);
  if (index < 0 || index >= tokens.length) return text;
  return tokens.filter((_, i) => i !== index).join(JOIN_SEPARATOR);
}

interface ProportionalPillInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function ProportionalPillInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: ProportionalPillInputProps) {
  const [pending, setPending] = useState("");
  const tokens = parsePillTokens(value);

  const commit = () => {
    const next = appendPillToken(value, pending);
    if (next === value) {
      setPending("");
      return;
    }
    onChange(next);
    setPending("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "/") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "Backspace" && pending.length === 0 && tokens.length > 0) {
      event.preventDefault();
      onChange(removePillTokenAt(value, tokens.length - 1));
    }
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "당사자별 소가 pill 입력"}
      className={cn(
        "flex min-h-20 flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
      )}
    >
      {tokens.map((token, idx) => (
        <span
          key={`${idx}-${token}`}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {formatWonInput(token)}
          <button
            type="button"
            aria-label={`토큰 ${formatWonInput(token)} 삭제`}
            onClick={() => onChange(removePillTokenAt(value, idx))}
            className="rounded-sm p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        type="text"
        inputMode="numeric"
        value={pending}
        onChange={(event) => setPending(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={tokens.length === 0 ? (placeholder ?? "예: 10,000,000") : ""}
        className="min-w-[80px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        aria-label="당사자별 소가 토큰 추가"
      />
    </div>
  );
}
