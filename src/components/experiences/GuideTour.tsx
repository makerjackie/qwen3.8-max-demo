export type GuideStep = {
  target?: string
  title: string
  body: string
  action?: () => void
  awaitInteraction?: boolean
}

export function GuideTour(_props: { worldId: string; steps: Array<GuideStep>; delay?: number }) {
  return null
}
