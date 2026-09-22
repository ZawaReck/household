import React from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  emptyValue?: number;
};

export const ClearableNumberInput: React.FC<Props> = ({
  value,
  onValueChange,
  emptyValue = 0,
  onFocus,
  onBlur,
  ...props
}) => {
  const [draft, setDraft] = React.useState(() => value == null ? "" : String(value));
  const focusedRef = React.useRef(false);

  React.useEffect(() => {
    if (!focusedRef.current) setDraft(value == null ? "" : String(value));
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw === "") {
          onValueChange(emptyValue);
          return;
        }
        const next = Number(raw);
        if (Number.isFinite(next)) onValueChange(next);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        onBlur?.(event);
      }}
    />
  );
};
