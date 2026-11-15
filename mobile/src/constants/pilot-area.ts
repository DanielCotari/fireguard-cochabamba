type PilotArea = { west: number; south: number; east: number; north: number };

export const pilotArea: PilotArea = {
  west: -66.35,
  south: -17.55,
  east: -65.95,
  north: -17.15,
} as const;

export function formatPilotExtent(area: PilotArea = pilotArea) {
  return `${Math.abs(area.north).toFixed(2)}°–${Math.abs(area.south).toFixed(2)}° S · ${Math.abs(area.west).toFixed(2)}°–${Math.abs(area.east).toFixed(2)}° O`;
}
