import { describe, expect, it } from 'vitest'
import { withDefaultSelectionDepth, type PhysicalSelection } from './stores/visor'

describe('ROI selection defaults', () => {
  it('uses the longest in-plane side for depth and preserves it at specimen bounds', () => {
    const selection: PhysicalSelection = { min: [10, 20, 0], max: [50, 40, 100] }
    const bounds: PhysicalSelection = { min: [0, 0, 0], max: [100, 100, 100] }

    expect(withDefaultSelectionDepth(selection, [0, 1, 2], 50, bounds)).toEqual({
      min: [10, 20, 30],
      max: [50, 40, 70],
    })
    expect(withDefaultSelectionDepth(selection, [0, 1, 2], 95, bounds)).toEqual({
      min: [10, 20, 60],
      max: [50, 40, 100],
    })
  })
})