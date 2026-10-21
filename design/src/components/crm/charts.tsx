import { useState } from "react";
import { smoothPath } from "./ui";

export const chartTones = ["var(--forest)", "var(--ember)", "var(--sun)", "var(--ink)"];

export function BarPlot({
  labels,
  series,
  max = 200,
  money = false,
  percent = false,
}: {
  labels: string[];
  series: number[][];
  max?: number;
  money?: boolean;
  percent?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const W = 700, H = 210, left = 38, step = (W - left) / labels.length;

  return (
    <div className="relative">
      {/* Floating Tooltip */}
      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute -top-12 z-20 -translate-x-1/2 rounded-xl border border-border/80 bg-popover/95 px-3 py-1 shadow-lg backdrop-blur-md transition-all duration-150"
          style={{ left: `${((left + (hoverIndex + 0.5) * step) / W) * 100}%` }}
        >
          <div className="text-center text-xs">
            <span className="font-semibold text-foreground">{labels[hoverIndex]}</span>
            <div className="font-bold text-forest">
              {series.map((s, j) => (
                <span key={j}>
                  {money ? "$" : ""}{s[hoverIndex] ?? 0}{money ? "K" : percent ? "%" : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <svg
        role="img"
        aria-label="Monthly bar chart"
        viewBox={`0 0 ${W} ${H + 30}`}
        className="h-56 w-full cursor-pointer select-none"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Y Axis Guide Lines */}
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={W}
              y1={H - (v / max) * H}
              y2={H - (v / max) * H}
              stroke="var(--border)"
              strokeDasharray="2 4"
              strokeOpacity="0.6"
            />
            <text x="0" y={Math.max(12, H - (v / max) * H + 4)} fontSize="11" fill="var(--muted-foreground)">
              {money ? "$" : ""}{v}{money && v > 0 ? "K" : percent ? "%" : ""}
            </text>
          </g>
        ))}

        {/* Bars */}
        {labels.map((l, i) => {
          let bottom = H;
          const isHovered = hoverIndex === i;
          return (
            <g
              key={l}
              onMouseEnter={() => setHoverIndex(i)}
              className="transition-all duration-200"
            >
              <rect
                x={left + i * step + 3}
                y="0"
                width={step - 9}
                height={H}
                rx="6"
                fill="var(--surface)"
                className={isHovered ? "opacity-100 fill-secondary" : "opacity-60"}
              />
              {series.map((s, j) => {
                const height = ((s[i] ?? 0) / max) * H;
                bottom -= height;
                return (
                  <rect
                    key={j}
                    x={left + i * step + 3}
                    y={bottom}
                    width={step - 9}
                    height={height}
                    fill={chartTones[j % chartTones.length]}
                    rx="4"
                    className="transition-all duration-300"
                    style={{
                      transformOrigin: `${left + i * step + (step - 9) / 2}px ${H}px`,
                      transform: isHovered ? "scaleY(1.03)" : "none",
                      filter: isHovered ? "brightness(1.15)" : "none",
                    }}
                  />
                );
              })}
              <text
                x={left + (i + 0.5) * step}
                y={H + 23}
                textAnchor="middle"
                fontSize="11"
                fill={isHovered ? "var(--foreground)" : "var(--muted-foreground)"}
                fontWeight={isHovered ? "bold" : "normal"}
                className="transition-colors"
              >
                {l}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LinePlot({
  labels,
  values,
  max = 100,
  money = false,
}: {
  labels: string[];
  values: number[];
  max?: number;
  money?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const pts = values.map(
    (v, i) => [38 + (i * 650) / Math.max(values.length - 1, 1), 190 - (v / max) * 175] as [number, number],
  );
  const first = pts[0], last = pts.at(-1), d = smoothPath(pts);

  const activePoint = hoverIndex !== null ? pts[hoverIndex] : null;
  const activeValue = hoverIndex !== null ? values[hoverIndex] : null;

  return (
    <div className="relative">
      {/* Floating Tooltip */}
      {activePoint && activeValue !== null && (
        <div
          className="pointer-events-none absolute -top-12 z-20 -translate-x-1/2 rounded-xl border border-border/80 bg-popover/95 px-3 py-1 shadow-lg backdrop-blur-md transition-all duration-150"
          style={{ left: `${(activePoint[0] / 700) * 100}%` }}
        >
          <div className="text-center text-xs">
            <span className="font-semibold text-foreground">{labels[hoverIndex]}</span>
            <div className="font-bold text-forest">
              {money ? "$" : ""}{activeValue}{money ? "K" : "%"}
            </div>
          </div>
        </div>
      )}

      <svg
        role="img"
        aria-label="Monthly trend chart"
        viewBox="0 0 700 225"
        className="h-56 w-full cursor-crosshair select-none"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Y Axis Guide Lines */}
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line
              x1="38"
              x2="690"
              y1={190 - (v / max) * 175}
              y2={190 - (v / max) * 175}
              stroke="var(--border)"
              strokeDasharray="3 5"
              strokeOpacity="0.6"
            />
            <text x="0" y={194 - (v / max) * 175} fontSize="11" fill="var(--muted-foreground)">
              {money ? "$" : ""}{v}{money ? "K" : "%"}
            </text>
          </g>
        ))}

        {/* Gradient fill underneath */}
        {first && last && (
          <path
            d={`${d} L${last[0]},190 L${first[0]},190 Z`}
            fill="var(--forest)"
            opacity=".14"
            className="transition-all duration-500"
          />
        )}

        {/* Trend Line */}
        <path
          d={d}
          stroke="var(--forest)"
          fill="none"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-500"
        />

        {/* Crosshair guide on hover */}
        {activePoint && (
          <g>
            <line
              x1={activePoint[0]}
              x2={activePoint[0]}
              y1={15}
              y2={190}
              stroke="var(--forest)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeOpacity="0.7"
            />
            <circle cx={activePoint[0]} cy={activePoint[1]} r="7" fill="var(--forest)" fillOpacity="0.3" />
            <circle cx={activePoint[0]} cy={activePoint[1]} r="4.5" fill="var(--forest)" stroke="white" strokeWidth="2" />
          </g>
        )}

        {/* Invisible hit targets */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r="16"
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {/* Month labels */}
        {labels.map((l, i) => (
          <text
            key={l}
            x={38 + (i * 650) / Math.max(labels.length - 1, 1)}
            y="218"
            textAnchor="middle"
            fontSize="11"
            fill={hoverIndex === i ? "var(--foreground)" : "var(--muted-foreground)"}
            fontWeight={hoverIndex === i ? "bold" : "normal"}
            className="transition-colors"
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}