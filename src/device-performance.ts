export type EffectQuality = 'auto' | 'full' | 'light'

export const LIGHT_DEVICE_QUERY = '(pointer: coarse), (max-width: 740px), (max-width: 1100px) and (max-height: 500px)'

export function effectProfile(quality: EffectQuality, constrained: boolean) {
  const light = quality === 'light' || (quality !== 'full' && constrained)
  return { light, fps: light ? 30 : 60, dpr: light ? 1 : 2, glow: !light }
}
