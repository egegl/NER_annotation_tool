import { LabelColor } from "@/types";

// Preset palette (hex). Cycled through for labels/choices without an explicit
// `background` attribute.
const PRESET_HEX: string[] = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#6366f1', // indigo
  '#6b7280', // gray
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#10b981', // emerald
  '#14b8a6', // teal
];

const toRgb = (hex: string): [number, number, number] | null => {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const buildColor = (r: number, g: number, b: number): LabelColor => ({
  solid: `rgb(${r}, ${g}, ${b})`,
  bg: `rgba(${r}, ${g}, ${b}, 0.25)`,
  // Darkened for readability over the translucent fill on a light surface.
  text: `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`,
});

/** Color for the Nth label/choice from the preset palette. */
export function generateColor(index: number): LabelColor {
  const rgb = toRgb(PRESET_HEX[index % PRESET_HEX.length])!;
  return buildColor(...rgb);
}

/** Build a color from a custom `background` value (hex). Falls back to gray. */
export function parseColor(input: string): LabelColor {
  const rgb = toRgb(input);
  return rgb ? buildColor(...rgb) : buildColor(107, 114, 128);
}
