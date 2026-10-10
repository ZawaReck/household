import React from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  emptyValue?: number;
  maskDisplay?: boolean;
};

export const ClearableNumberInput: React.FC<Props> = ({
  value,
  onValueChange,
  emptyValue = 0,
  maskDisplay = false,
  onFocus,
  onBlur,
  ...props
}) => {
  const [draft, setDraft] = React.useState(() => value == null ? "" : String(value));
  const focusedRef = React.useRef(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const isMasked = maskDisplay && !isFocused;

  React.useEffect(() => {
    if (!focusedRef.current) setDraft(value == null ? "" : String(value));
  }, [value]);

  return (
    <input
      {...props}
      type={isMasked ? "text" : "number"}
      value={isMasked ? "******" : draft}
      aria-label={isMasked ? `${props["aria-label"] ?? "金額"}（マスク中。編集するには選択）` : props["aria-label"]}
      onFocus={(event) => {
        focusedRef.current = true;
        setIsFocused(true);
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
        setIsFocused(false);
        onBlur?.(event);
      }}
    />
  );
};
