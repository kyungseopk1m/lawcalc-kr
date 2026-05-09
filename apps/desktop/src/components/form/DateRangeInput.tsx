import { Input } from "../ui/input";

interface DateRangeInputProps {
  startDate: string;
  endDate: string;
  error?: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}

export function DateRangeInput({
  startDate,
  endDate,
  error,
  onStartDateChange,
  onEndDateChange,
}: DateRangeInputProps) {
  const errorId = "date-range-error";

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">계산 기간</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          시작일
          <Input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          종료일
          <Input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
          />
        </label>
      </div>
      {error ? (
        <span id={errorId} className="text-xs font-normal text-red-600">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}
