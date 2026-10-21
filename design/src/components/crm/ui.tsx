import type { ReactNode, ButtonHTMLAttributes } from "react";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { reps, type Person, type RepKey } from "@/lib/crm-data";

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("glass-card p-5", className)}>{children}</section>;
}

export function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-medium">{title}</h2>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function IconBtn({ children, className, label, tone = "light", ...props }: { children: ReactNode; className?: string; label: string; tone?: "light" | "ghost-dark" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border transition-colors",
        tone === "light" ? "border-border bg-card hover:bg-secondary" : "border-current/30 hover:bg-foreground/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

export const MoreBtn = ({ className }: { className?: string }) => (
  <IconBtn label="More" className={cn("size-9", className)}>
    <MoreHorizontal className="size-4" />
  </IconBtn>
);
export const OpenBtn = () => (
  <IconBtn label="Open" className="size-9">
    <ArrowUpRight className="size-4" />
  </IconBtn>
);

const tints = ["bg-forest/15 text-forest", "bg-ember/20 text-ember", "bg-sun/40 text-sun-foreground", "bg-ink/10 text-foreground"];

export function Avatar({ person, size = 32, className }: { person: Person; size?: number; className?: string }) {
  const initials = person.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const tint = tints[person.name.charCodeAt(0) % tints.length];
  return person.img ? (
    <img src={person.img} alt={person.name} width={size} height={size} loading="lazy" className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-medium", tint, className)} style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {initials}
    </span>
  );
}

export function AvatarStack({ team, size = 24, ring = "ring-card" }: { team: RepKey[]; size?: number; ring?: string }) {
  return (
    <div className="flex -space-x-2">
      {team.map((k) => (
        <Avatar key={k} person={reps[k]} size={size} className={cn("ring-2", ring)} />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className }: { options: T[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-full bg-secondary p-1", className)}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn("rounded-full px-3.5 py-1.5 text-sm transition-all", value === o ? "bg-popover font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function PrimaryBtn({ children, className, ...props }: { children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={cn("inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90", className)}>
      {children}
    </button>
  );
}

export function Ring({ pct, size = 64, stroke = 6, color = "var(--forest)", track = "var(--track)", children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(pct, 1) / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Smooth SVG path through points (Catmull-Rom → Bézier). */
export function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  const f = pts[0];
  if (!f) return "";
  let d = `M${f[0]},${f[1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) continue;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}
