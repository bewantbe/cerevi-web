import { describe, expect, it } from 'vitest'
import { buildContrastLimits, clampContrastLimits, CONTRAST_RANGE } from 'galavi/advanced'
import {
  contrastLimitsForPlane,
  sliceChannelLayerId,
  type SliceDef,
  type SetupContext,
} from './galavi-setup'

describe('source-aware contrast metadata', () => {
  it('keeps every channel window and uses a neutral fallback only for a missing channel', () => {
    const metadataLimits: Array<[number, number] | undefined> = [
      [0.01, 0.1],
      [-0.2, 1.4],
      undefined,
    ]

    const limits = buildContrastLimits(metadataLimits, 4)

    expect(limits).toEqual([
      [0.01, 0.1],
      [0, 1],
      [0, 1],
      [0, 1],
    ])
    expect(limits[0]).not.toBe(metadataLimits[0])
  })

  it('uses one fixed range and clamps restored values into it', () => {
    expect(CONTRAST_RANGE).toEqual([0, 1])
    expect(clampContrastLimits([-0.5, 1.5])).toEqual([0, 1])
    expect(clampContrastLimits([0.8, 0.2])).toEqual([0.8, 0.8])
  })

  it('resolves XZ and YZ through their own storage sources', () => {
    const ctx = {
      imageryContrastLimits: {
        volume: [[0.01, 0.11], [0.02, 0.12]],
        xy: [[0.21, 0.31], [0.22, 0.32]],
        xz: [[0.41, 0.51], [0.42, 0.52]],
        yz: [[0.61, 0.71], [0.62, 0.72]],
      },
      sliceDefs: {
        xy: { sourcePlane: 'xy' },
        xz: { sourcePlane: 'yz' },
        yz: { sourcePlane: 'xz' },
      },
    } as unknown as SetupContext

    expect(contrastLimitsForPlane(ctx, 'xy', 1)).toEqual([0.22, 0.32])
    expect(contrastLimitsForPlane(ctx, 'xz', 1)).toEqual([0.62, 0.72])
    expect(contrastLimitsForPlane(ctx, 'yz', 1)).toEqual([0.42, 0.52])
  })
})

describe('slice channel composition', () => {
  it('gives every channel a stable layer id within its plane', () => {
    const definition = { layerId: 'sliceXY' } as SliceDef

    expect(sliceChannelLayerId(definition, 0)).toBe('sliceXY:c0')
    expect(sliceChannelLayerId(definition, 3)).toBe('sliceXY:c3')
  })
})
