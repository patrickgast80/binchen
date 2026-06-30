import * as React from "react";

export interface PantsColors {
  bund: string;
  mainLeft: string;
  mainRight: string;
  buendchen: string;
}

interface PantsSvgProps extends React.SVGAttributes<SVGSVGElement> {
  colors: PantsColors;
  title?: string;
}

/**
 * Stilisierte Pumphose, gegliedert in 4 unabhängig einfärbbare Regionen.
 * Bewusst als Inline-SVG (keine Bitmap-Texturen) — flach, knackig auf jedem
 * Display und tauschbar gegen echte Stoffmuster (regions-keyed, gleiche IDs).
 */
export function PantsSvg({ colors, title = "Hose-Vorschau", ...rest }: PantsSvgProps) {
  const stroke = "rgba(44, 36, 23, 0.28)";
  const stitch = "rgba(44, 36, 23, 0.22)";

  return (
    <svg
      viewBox="0 0 600 720"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>

      {/* Soft ground shadow */}
      <ellipse cx="300" cy="690" rx="200" ry="14" fill="rgba(44,36,23,0.08)" />

      {/* Hauptteil links */}
      <path
        d="M 115 175 L 300 175 L 300 540 L 215 540 C 130 540, 55 470, 55 380 C 55 290, 80 215, 115 175 Z"
        fill={colors.mainLeft}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Hauptteil rechts */}
      <path
        d="M 300 175 L 485 175 C 520 215, 545 290, 545 380 C 545 470, 470 540, 385 540 L 300 540 Z"
        fill={colors.mainRight}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Bund */}
      <path
        d="M 130 60 Q 130 50 140 50 L 460 50 Q 470 50 470 60 L 485 175 L 115 175 Z"
        fill={colors.bund}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Drawstring detail (decorative) */}
      <path
        d="M 285 95 Q 300 85, 315 95"
        fill="none"
        stroke={stitch}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx="285" cy="95" r="3" fill={stitch} />
      <circle cx="315" cy="95" r="3" fill={stitch} />

      {/* Bündchen links */}
      <path
        d="M 215 540 L 300 540 L 300 640 Q 300 652 288 652 L 227 652 Q 215 652 215 640 Z"
        fill={colors.buendchen}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Bündchen rechts */}
      <path
        d="M 300 540 L 385 540 L 385 640 Q 385 652 373 652 L 312 652 Q 300 652 300 640 Z"
        fill={colors.buendchen}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Stitch seams */}
      <line
        x1="118"
        y1="175"
        x2="482"
        y2="175"
        stroke={stitch}
        strokeWidth={1.5}
        strokeDasharray="4 5"
      />
      <line
        x1="217"
        y1="540"
        x2="383"
        y2="540"
        stroke={stitch}
        strokeWidth={1.5}
        strokeDasharray="4 5"
      />
      <line
        x1="300"
        y1="178"
        x2="300"
        y2="538"
        stroke={stitch}
        strokeWidth={1.5}
        strokeDasharray="4 5"
      />
    </svg>
  );
}
