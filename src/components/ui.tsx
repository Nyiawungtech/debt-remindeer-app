import { useEffect, useRef, type ReactNode } from "react";
import {
  ShoppingBag,
  Car,
  Armchair,
  Heart,
  Landmark,
  CircleDollarSign,
  X,
} from "lucide-react";
export function Merchant({
  category,
  large = false,
}: {
  category: string;
  large?: boolean;
}) {
  const Icon =
    (
      {
        Shopping: ShoppingBag,
        Auto: Car,
        Home: Armchair,
        Health: Heart,
        Personal: Landmark,
      } as Record<string, typeof ShoppingBag>
    )[category] || CircleDollarSign;
  return (
    <span
      className={`merchant ${category.toLowerCase()} ${large ? "large" : ""}`}
    >
      <Icon size={large ? 28 : 20} />
    </span>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        s<span>·</span>
      </span>
      settleup<span className="brand-dot">.</span>
    </span>
  );
}
export function Bar({ value }: { value: number }) {
  return (
    <div
      className={`bar ${value === 100 ? "complete" : ""}`}
      role="progressbar"
      aria-label="Debt paid"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = dialog.current!;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">✧</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
