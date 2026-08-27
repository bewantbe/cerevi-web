import { describe, expect, it } from 'vitest'
import { buildContrastLimits, clampContrastLimits, CONTRAST_RANGE } from 'galavi'
import { sliceChannelLayerId } from '@/galavi/layer-factories'
import { contrastLimitsForPlane, type SliceDef } from '@/galavi/slice-geometry'
import type { CereviDataset } from '@/galavi/specimen-dataset'

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
    const planeChannels = {
      xy: [{ contrast: [0.21, 0.31] }, { contrast: [0.22, 0.32] }],
      xz: [{ contrast: [0.41, 0.51] }, { contrast: [0.42, 0.52] }],
      yz: [{ contrast: [0.61, 0.71] }, { contrast: [0.62, 0.72] }],
    }
    const dataset = {
      sliceOrientations: {
        xy: { sourcePlane: 'xy' },
        xz: { sourcePlane: 'yz' },
        yz: { sourcePlane: 'xz' },
      },
      planeResource: (plane: 'xy' | 'xz' | 'yz') => ({ channels: planeChannels[plane] }),
    } as unknown as CereviDataset

    expect(contrastLimitsForPlane(dataset, 'xy', 1)).toEqual([0.22, 0.32])
    expect(contrastLimitsForPlane(dataset, 'xz', 1)).toEqual([0.62, 0.72])
    expect(contrastLimitsForPlane(dataset, 'yz', 1)).toEqual([0.42, 0.52])
  })
})

describe('slice channel composition', () => {
  it('gives every channel a stable layer id within its plane', () => {
    const definition = { layerId: 'sliceXY' } as SliceDef

    expect(sliceChannelLayerId(definition, 0)).toBe('sliceXY:c0')
    expect(sliceChannelLayerId(definition, 3)).toBe('sliceXY:c3')
  })
})
