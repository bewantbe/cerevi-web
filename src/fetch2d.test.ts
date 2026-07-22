import { describe, expect, it } from 'vitest'
import { packPlaneToFloat16 } from '@galavi/ome-zarr-adapter'

describe('packPlaneToFloat16', () => {
  it('transposes upstream ZY rows into a Z-fastest sagittal texture', () => {
    const input = new Uint8Array([
      0, 255, 0,
      255, 0, 255,
    ])

    const packed = packPlaneToFloat16(
      input,
      'uint8',
      [1, 3, 2],
      [0, 3, 2],
      [2, 1, 0],
      [2, 1],
    )

    expect([...new Uint16Array(packed)]).toEqual([
      0, 0x3c00,
      0x3c00, 0,
      0, 0x3c00,
    ])
  })
})