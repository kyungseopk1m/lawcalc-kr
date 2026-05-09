import { Plus, Trash2 } from "lucide-react";

import type { RateSegment } from "@lawcalc-kr/core-engine";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface RateSegmentInputProps {
  fallbackLabel: string;
  value: RateSegment[];
  error?: string;
  onChange: (segments: RateSegment[]) => void;
}

function updateSegment(
  segments: RateSegment[],
  index: number,
  field: keyof RateSegment,
  value: string | number,
) {
  return segments.map((segment, segmentIndex) =>
    segmentIndex === index ? { ...segment, [field]: value } : segment,
  );
}

export function RateSegmentInput({ fallbackLabel, value, error, onChange }: RateSegmentInputProps) {
  const addSegment = () => {
    onChange([...value, { from: "", to: "", rate: 0.05 }]);
  };
  const errorId = "rate-segments-error";

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">이자율 구간</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            구간이 없으면 {fallbackLabel} 프리셋을 전체 기간에 적용합니다.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addSegment}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          추가
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
          직접 지정한 이자율 구간이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {value.map((segment, index) => (
            <div
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_110px_40px]"
              key={`${index}-${segment.from}-${segment.to}`}
            >
              <label className="grid gap-1 text-xs font-medium">
                시작일
                <Input
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error)}
                  type="date"
                  value={segment.from}
                  onChange={(event) =>
                    onChange(updateSegment(value, index, "from", event.target.value))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                종료일
                <Input
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error)}
                  type="date"
                  value={segment.to}
                  onChange={(event) =>
                    onChange(updateSegment(value, index, "to", event.target.value))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                연이율(%)
                <Input
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error)}
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  type="number"
                  value={segment.rate > 0 ? segment.rate * 100 : ""}
                  onChange={(event) =>
                    onChange(updateSegment(value, index, "rate", Number(event.target.value) / 100))
                  }
                />
              </label>
              <Button
                aria-label="이자율 구간 삭제"
                className="self-end"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((_, segmentIndex) => segmentIndex !== index))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {error ? (
        <span id={errorId} className="text-xs font-normal text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
