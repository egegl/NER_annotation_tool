import { LabelColor } from "@/types";

const PRESET_COLORS: LabelColor[] = [
  { bg: 'bg-red-500/30', text: 'text-red-900', border: 'border-red-500', indicator: 'bg-red-500' },
  { bg: 'bg-blue-500/30', text: 'text-blue-900', border: 'border-blue-500', indicator: 'bg-blue-500' },
  { bg: 'bg-green-500/30', text: 'text-green-900', border: 'border-green-500', indicator: 'bg-green-500' },
  { bg: 'bg-yellow-500/30', text: 'text-yellow-900', border: 'border-yellow-500', indicator: 'bg-yellow-500' },
  { bg: 'bg-purple-500/30', text: 'text-purple-900', border: 'border-purple-500', indicator: 'bg-purple-500' },
  { bg: 'bg-orange-500/30', text: 'text-orange-900', border: 'border-orange-500', indicator: 'bg-orange-500' },
  { bg: 'bg-pink-500/30', text: 'text-pink-900', border: 'border-pink-500', indicator: 'bg-pink-500' },
  { bg: 'bg-indigo-500/30', text: 'text-indigo-900', border: 'border-indigo-500', indicator: 'bg-indigo-500' },
  { bg: 'bg-gray-500/30', text: 'text-gray-900', border: 'border-gray-500', indicator: 'bg-gray-500' },
  { bg: 'bg-cyan-500/30', text: 'text-cyan-900', border: 'border-cyan-500', indicator: 'bg-cyan-500' },
  { bg: 'bg-lime-500/30', text: 'text-lime-900', border: 'border-lime-500', indicator: 'bg-lime-500' },
  { bg: 'bg-emerald-500/30', text: 'text-emerald-900', border: 'border-emerald-500', indicator: 'bg-emerald-500' },
  { bg: 'bg-teal-500/30', text: 'text-teal-900', border: 'border-teal-500', indicator: 'bg-teal-500' },

];


export function generateColor(index: number): LabelColor {
  // Cycle through the preset colors
  return PRESET_COLORS[index % PRESET_COLORS.length];
}

    
    
    