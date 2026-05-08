interface FormulaCellProps {
  formula: string;
}

export function FormulaCell({ formula }: FormulaCellProps) {
  return (
    <code className="block max-w-[280px] whitespace-normal rounded bg-muted px-2 py-1 text-xs leading-5 text-foreground">
      {formula}
    </code>
  );
}
