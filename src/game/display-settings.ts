export type ViewDistance = 'standard' | 'near' | 'far';
export function cameraZoom(
  width: number,
  height: number,
  touch: boolean,
  view: ViewDistance,
): number {
  if (touch && width > height)
    return view === 'near' ? 1.5 : view === 'far' ? 1.15 : 1.3;
  if (width < 600) return view === 'near' ? 1.65 : view === 'far' ? 1.25 : 1.45;
  return view === 'near' ? 1.9 : view === 'far' ? 1.35 : 1.65;
}
