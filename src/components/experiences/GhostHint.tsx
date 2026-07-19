export type GhostGesture =
  | { type: 'drag'; target: string; dx?: number; dy?: number; label: string }
  | { type: 'scrub'; target: string; label: string }
  | { type: 'tap'; target: string; label: string }

export function GhostHint(_props: { worldId: string; gesture: GhostGesture; delay?: number }) {
  return null
}
