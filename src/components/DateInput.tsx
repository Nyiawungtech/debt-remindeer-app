import type { InputHTMLAttributes } from "react";

export function DateInput({
  className = "",
  onClick,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <span className="date-control">
      <input
        {...props}
        type="date"
        className={`date-input ${className}`}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || event.currentTarget.disabled) return;
          // Open from the entire field, with the native input as the fallback
          // on browsers that do not expose showPicker (including older Safari).
          try {
            event.currentTarget.showPicker?.();
          } catch {
            // Keyboard editing and the browser's own picker remain available.
          }
        }}
      />
    </span>
  );
}
