import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Traveldesk primitive kit.
   Every primitive ships with: focus ring, hover, disabled, loading and
   an empty state. One visual language for the whole workspace.
   ========================================================================== */

/* ---------------------------------------------------------------- Panels */

export function Panel({
  className,
  children,
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article" | "aside";
}) {
  return <Tag className={cn("glass-card p-5", className)}>{children}</Tag>;
}

export function PanelHead({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Buttons */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
};

const TONE: Record<string, string> = {
  primary: "bg-ink text-on-ink hover:opacity-90 active:scale-[.98] disabled:opacity-45 shadow-xs",
  secondary:
    "bg-glass-2 text-foreground border border-line-2 hover:bg-glass-3 active:scale-[.98] disabled:opacity-45",
  ghost: "text-foreground hover:bg-well active:scale-[.98] disabled:opacity-45",
  danger: "bg-tomato text-on-tomato hover:opacity-90 active:scale-[.98] disabled:opacity-45",
};

const SIZE: Record<string, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5",
  md: "h-10 px-4 text-[13px] gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export function Btn({
  tone = "secondary",
  size = "md",
  icon,
  trailing,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold transition-all duration-150",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="animate-spin">◌</span> : icon}
      {children}
      {trailing}
    </button>
  );
}

export function IconBtn({
  label,
  tone = "ghost",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "ghost" | "solid";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border transition-all duration-150",
        "[&_svg]:size-4",
        tone === "solid"
          ? "border-line bg-glass-2 text-foreground hover:bg-glass-3"
          : "border-transparent text-muted hover:bg-well hover:text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="switchboard__views" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={value === option ? "is-active" : undefined}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold transition-all duration-150",
        active
          ? "bg-ink text-on-ink"
          : "bg-glass-2 text-muted hover:bg-glass-3 hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10.5px] font-bold tabular-nums",
            active ? "bg-on-ink/20 text-on-ink" : "bg-well text-faint",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ----------------------------------------------------------------- Badge */

export type Tone = "pine" | "butter" | "tomato" | "ink" | "neutral";

const TONE_CLS: Record<Tone, string> = {
  pine: "bg-pine text-on-pine",
  butter: "bg-butter text-on-butter",
  tomato: "bg-tomato text-on-tomato",
  ink: "bg-ink text-on-ink",
  neutral: "bg-well text-muted",
};

export function Badge({ tone = "pine", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        TONE_CLS[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Avatar */

const AVATAR_TONES = [
  "bg-forest/18 text-forest",
  "bg-ember/16 text-ember",
  "bg-sun/35 text-sun-foreground",
  "bg-ink/10 text-foreground",
];

export function Avatar({
  name,
  size = 32,
  src,
}: {
  name: string;
  size?: number;
  src?: string | null;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const tone = AVATAR_TONES[name.charCodeAt(0) % AVATAR_TONES.length];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-bold", tone)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials || "?"}
    </span>
  );
}

export function AvatarStack({
  names,
  size = 24,
  max = 3,
}: {
  names: string[];
  size?: number;
  max?: number;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((name) => (
        <span key={name} className="ring-2 ring-card rounded-full">
          <Avatar name={name} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="grid place-items-center rounded-full bg-well font-bold text-muted ring-2 ring-card"
          style={{ width: size, height: size, fontSize: size * 0.34 }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ Ring */

export function Ring({
  pct,
  size = 64,
  stroke = 6,
  color = "var(--pine)",
  track = "var(--line-2)",
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * clamped) / 100} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center leading-none">
        {children}
      </span>
    </span>
  );
}

export function Meter({
  pct,
  color = "var(--pine)",
  height = 6,
}: {
  pct: number;
  color?: string;
  height?: number;
}) {
  return (
    <span
      className="block w-full overflow-hidden rounded-full bg-well"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------- Stat */

export function StatTile({
  icon,
  value,
  label,
  delta,
  tone = "neutral",
  href,
  onClick,
}: {
  icon?: ReactNode | undefined;
  value: ReactNode;
  label: string;
  delta?: { text: string; dir: "up" | "down" } | undefined;
  tone?: Tone | "neutral" | undefined;
  href?: string | undefined;
  onClick?: (() => void) | undefined;
}) {
  const inner = (
    <>
      {icon && <span className={cn("stat-tile__icon", `tone-${tone}`)}>{icon}</span>}
      <span className="stat-tile__body">
        <span className="stat-tile__value">
          {value}
          {delta && <span className={cn("stat-tile__delta", delta.dir)}>{delta.text}</span>}
        </span>
        <span className="stat-tile__label">{label}</span>
      </span>
    </>
  );
  const cls = cn("stat-tile", !href && !onClick && "is-static");
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/* ----------------------------------------------------------------- Field */

export function Field({
  label,
  hint,
  error,
  required,
  wide,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  wide?: boolean | undefined;
  children: (props: { id: string; "aria-describedby"?: string | undefined }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex flex-col gap-1.5 text-[12.5px] font-medium text-foreground",
        wide && "full-width",
      )}
    >
      <span className="flex items-center gap-1">
        {label}
        {required && <span className="text-tomato">*</span>}
      </span>
      {children({ id, "aria-describedby": describedBy })}
      {error ? (
        <small id={`${id}-err`} className="text-[11.5px] font-medium text-tomato">
          {error}
        </small>
      ) : hint ? (
        <small id={`${id}-hint`} className="field-hint">
          {hint}
        </small>
      ) : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line-2 bg-glass-3 px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-faint focus:border-pine focus:bg-solid";

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  steps,
  actions,
}: {
  icon?: ReactNode | undefined;
  title: string;
  description?: string | undefined;
  steps?: string[] | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="empty-state--smart">
      {icon && <span className="empty-state__art">{icon}</span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {steps && steps.length > 0 && (
        <ol className="empty-state__steps">
          {steps.map((step, i) => (
            <li key={step}>
              <b>{i + 1}</b>
              {step}
            </li>
          ))}
        </ol>
      )}
      {actions && <div className="empty-state__actions">{actions}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- Sheet */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="app-scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed right-3 top-3 bottom-3 z-[60] flex w-[min(100vw-24px,var(--sheet-w))] flex-col overflow-hidden rounded-[28px] bg-float shadow-pop"
        style={{ "--sheet-w": `${width}px` } as React.CSSProperties}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h2>
            {description && <p className="mt-1 text-[12.5px] text-muted">{description}</p>}
          </div>
          <IconBtn label="Close" onClick={onClose}>
            <X />
          </IconBtn>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly string[];
  value: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="r360__tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          className={value === tab ? "is-active" : undefined}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Menu */

export function FilterMenu({
  label,
  value,
  options,
  onChange,
  counts,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="filter" ref={ref}>
      <button
        type="button"
        className={cn("filter__trigger", value !== "All" && "is-set")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {value !== "All" ? value : label}
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div className="filter__menu" role="listbox">
          <div className="filter__label">{label}</div>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              className={cn("filter__option", value === option && "is-active")}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {value === option && <Check className="size-3.5" />}
              <span className={cn(!value.startsWith(option) && value !== "All" && "pl-5")}>
                {option}
              </span>
              {counts?.[option] !== undefined && <span className="count">{counts[option]}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Kbd */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted">
      {children}
    </kbd>
  );
}
