// Minimal Tailwind UI primitives (shadcn-style, hand-rolled, offline).

import * as React from "react";
import { createPortal } from "react-dom";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
  size?: "sm" | "md" | "icon";
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:pointer-events-none select-none";
  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-sm",
    icon: "h-9 w-9",
  }[size];
  const variants = {
    default:
      "bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)]",
    outline:
      "bg-transparent text-[var(--text)] border border-[var(--border)] hover:bg-[var(--panel-2)]",
    ghost: "bg-transparent text-[var(--text)] hover:bg-[var(--panel-2)]",
    accent:
      "bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent hover:opacity-90",
  }[variant];
  return <button className={cn(base, sizes, variants, className)} {...props} />;
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--panel)]",
        className,
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
      {...props}
    />
  );
}

export function Chip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full px-3 text-sm font-medium border transition-colors",
        active
          ? "bg-[var(--accent)] text-[var(--accent-fg)] border-transparent"
          : "bg-[var(--panel-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "h-7 rounded-md px-3 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-[var(--panel)] text-[var(--text)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
});

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium text-[var(--text-muted)]", className)}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "error" | "warning" | "success";
}) {
  const tones = {
    neutral: "bg-[var(--panel-2)] text-[var(--text-muted)] border-[var(--border)]",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones,
        className,
      )}
      {...props}
    />
  );
}

/** Click-to-open menu. The panel is rendered in a portal with fixed positioning
 *  so it escapes any `overflow`/stacking context of its container (e.g. the
 *  horizontally-scrolling top bar) and is never clipped. `children` receives a
 *  `close` fn to dismiss after an action. */
export function Dropdown({
  trigger,
  children,
  align = "end",
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const WIDTH = 200;

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const raw = align === "end" ? r.right - WIDTH : r.left;
    const left = Math.min(Math.max(8, raw), window.innerWidth - WIDTH - 8);
    setPos({ top: r.bottom + 4, left });
  }, [align]);

  React.useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const reposition = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  return (
    <>
      <span ref={triggerRef} onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </span>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[200] rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1"
            style={{ top: pos.top, left: pos.left, width: WIDTH, boxShadow: "var(--shadow-panel)" }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--panel-2)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
