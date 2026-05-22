// Keymano emblem — an orange keyboard plate (the hero) over dim, embossed
// keycaps that fade toward the border. Matches the app icon. Pure vector;
// gradient/mask ids are per-instance so multiple logos coexist.

import { useId } from "react";

// scattered backdrop caps: [x, y, size, rotation, glyph]
const SCATTER: Array<[number, number, number, number, string]> = [
  [12, 14, 20, -13, "Q"],
  [31, 14, 18, 8, "W"],
  [50, 15, 17, -4, "⌥"],
  [69, 14, 18, -8, "E"],
  [90, 18, 20, 12, "R"],
  [7, 45, 18, -8, "A"],
  [94, 48, 18, 9, "S"],
  [14, 82, 20, 11, "Z"],
  [34, 90, 18, -9, "X"],
  [50, 91, 17, 3, "⏎"],
  [69, 90, 18, 7, "C"],
  [91, 78, 21, -11, "⌘"],
];

export function Logo({
  size = 40,
  className,
  title = "Keymano",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={id("plate")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--logo-plate-0)" />
          <stop offset="100%" stopColor="var(--logo-plate-1)" />
        </linearGradient>
        <linearGradient id={id("orange")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--logo-key-0)" />
          <stop offset="100%" stopColor="var(--logo-key-1)" />
        </linearGradient>
        <linearGradient id={id("keycap")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--logo-cap-0)" />
          <stop offset="100%" stopColor="var(--logo-cap-1)" />
        </linearGradient>
        <radialGradient id={id("fade")} cx="50%" cy="52%" r="52%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="48%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id={id("fadeMask")} maskContentUnits="userSpaceOnUse">
          <rect x="0" y="0" width="100" height="100" fill={`url(#${id("fade")})`} />
        </mask>
        <filter id={id("shadow")} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="2" floodColor="#000000" floodOpacity="0.4" />
        </filter>
        <filter id={id("glow")} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* faint glow behind the plate */}
      <circle cx="50" cy="51" r="32" fill="var(--logo-glow)" opacity="0.05" filter={`url(#${id("glow")})`} />

      {/* dim embossed keys, faded near the border */}
      <g
        mask={`url(#${id("fadeMask")})`}
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontWeight={800}
        textAnchor="middle"
        fill="var(--logo-cap-text)"
      >
        {SCATTER.map(([x, y, s, rot, g], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
            <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.22} fill={`url(#${id("keycap")})`} />
            <text x="0" y={s * 0.16} fontSize={s * 0.46}>
              {g}
            </text>
          </g>
        ))}
      </g>

      {/* keyboard plate (hero) */}
      <g>
        <rect x="13" y="29" width="74" height="44" rx="10" fill={`url(#${id("plate")})`} stroke={`url(#${id("orange")})`} strokeWidth="3" />
        <rect x="20" y="36" width="60" height="3" rx="1.5" fill="var(--logo-key-0)" opacity="0.22" />
        <g fill={`url(#${id("orange")})`}>
          <rect x="24" y="42" width="8" height="7" rx="2" />
          <rect x="34" y="42" width="8" height="7" rx="2" />
          <rect x="44" y="42" width="8" height="7" rx="2" />
          <rect x="54" y="42" width="8" height="7" rx="2" />
          <rect x="64" y="42" width="8" height="7" rx="2" />
          <rect x="29" y="52" width="8" height="7" rx="2" />
          <rect x="39" y="52" width="8" height="7" rx="2" />
          <rect x="49" y="52" width="8" height="7" rx="2" />
          <rect x="59" y="52" width="8" height="7" rx="2" />
          <rect x="36" y="62" width="28" height="7" rx="2" />
        </g>
      </g>
    </svg>
  );
}
