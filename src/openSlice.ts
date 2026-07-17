/**
 * Visor-specific OME-Zarr slice opener.
 *
 * The xy/xz/yz precomputed projection slice sources are valid OME-Zarr arrays
 * whose "slice axis" indexes a precomputed plane (e.g. xz slice y∈[0..3000]
 * indexes one xz projection per stride along the original y axis). To render
 * one slice plane we need a fetch that:
 *   - reads exactly 1 voxel along the slice axis at the requested index,
 *   - reads a 2D tile along the plane axes,
 *   - returns the result already laid out as the slice layer expects
 *     (u-fastest, where u = axisMap[0], v = axisMap[1]), transposing when
 *     anatomical orientation reverses the source's natural plane order.
 *
 * The standard adapter fetches a complete 3D storage chunk. Projection views
 * instead read one plane through that chunk and retain the storage chunk size
 * on the two visible axes.
 *
 * Only used for slice layers. The 3D volume keeps using the adapter's
 * standard `fetchTile`.
 */

import * as zarr from 'zarrita'
import type { ImagePyramid, Vec3 } from 'galavi'
import { openOMEZarr, type OMEZarrInfo } from '@galavi/ome-zarr-adapter'

export type SliceAxis = 0 | 1 | 2
export type SliceAxisMap = [SliceAxis, SliceAxis, SliceAxis]

export interface Slice {
  /** Underlying adapter info — used for physical transform, channels, scales. */
  info: OMEZarrInfo
  /** Plane-specific pyramid; through-plane chunks are collapsed to one voxel. */
  pyramid: ImagePyramid
  /** Custom fetch returning a half-precision r16float buffer ready for the slice layer texture. */
  fetch: (req: {
    level?: number
    position?: number[]
    selection?: Record<string, number>
  }) => Promise<ArrayBuffer>
}

interface ZarrGetResult {
  data: ArrayLike<number>
}

export async function openSlice(url: string, axisMap: SliceAxisMap): Promise<Slice> {
  const info = await openOMEZarr(url)
  const sliceAxis = axisMap[2]

  // Re-open the zarr arrays. The adapter doesn't expose them.
  const store = new zarr.FetchStore(url)
  let root: zarr.Group<zarr.FetchStore>
  try {
    root = (await zarr.open.v3(store, { kind: 'group' })) as zarr.Group<zarr.FetchStore>
  } catch {
    root = (await zarr.open.v2(store, { kind: 'group' })) as zarr.Group<zarr.FetchStore>
  }
  const ome = (root.attrs as Record<string, unknown>).ome as
    | { multiscales?: Array<{ axes: Array<{ name: string }>; datasets: Array<{ path: string }> }> }
    | undefined
  const ms =
    ome?.multiscales?.[0] ??
    (
      (root.attrs as Record<string, unknown>).multiscales as Array<{
        axes: Array<{ name: string }>
        datasets: Array<{ path: string }>
      }>
    )?.[0]
  if (!ms) throw new Error(`openSlice: no multiscales in ${url}`)

  const axes = ms.axes // upstream order, e.g. [c, z, y, x]
  const arrays: zarr.Array<zarr.DataType>[] = []
  for (const ds of ms.datasets) {
    const loc = root.resolve(ds.path)
    let arr: zarr.Array<zarr.DataType>
    try {
      arr = (await zarr.open.v3(loc, { kind: 'array' })) as zarr.Array<zarr.DataType>
    } catch {
      arr = (await zarr.open.v2(loc, { kind: 'array' })) as zarr.Array<zarr.DataType>
    }
    arrays.push(arr)
  }

  const pyramid: ImagePyramid = {
    levels: info.pyramid.levels.map((level) => {
      const chunkSize = [...level.chunkSize] as Vec3
      chunkSize[sliceAxis] = 1
      return {
        path: level.path,
        shape: [...level.shape] as Vec3,
        chunkSize,
        scale: [...level.scale] as Vec3,
      }
    }),
  }

  const dtype = info.dtype

  const fetchSlice = async (req: {
    level?: number
    position?: number[]
    selection?: Record<string, number>
  }): Promise<ArrayBuffer> => {
    const level = Math.max(0, Math.min(req.level ?? 0, arrays.length - 1))
    const position = req.position ?? [0, 0, 0]
    const selection = req.selection ?? info.defaultSelection
    const lv = info.pyramid.levels[level]
    const tileXYZ = pyramid.levels[level].chunkSize
    const totalVoxels = tileXYZ[0] * tileXYZ[1] * tileXYZ[2]
    const arr = arrays[level]

    // Build per-axis selection in upstream axis order.
    // Plane axes: half-open slices [start, end). Slice axis: scalar at requested plane.
    // Non-spatial axes (c, t, ...): scalar from selection.
    const sel: (number | zarr.Slice)[] = new Array(axes.length)
    let outOfBounds = false
    const validShape: Vec3 = [0, 0, 0]
    const resultAxes: SliceAxis[] = []
    for (let i = 0; i < axes.length; i++) {
      const name = axes[i].name
      if (name === 'x' || name === 'y' || name === 'z') {
        const ax: 0 | 1 | 2 = name === 'x' ? 0 : name === 'y' ? 1 : 2
        const start = position[ax]
        if (ax === sliceAxis) {
          if (start < 0 || start >= lv.shape[ax]) {
            outOfBounds = true
            break
          }
          sel[i] = start
        } else {
          if (start < 0 || start >= lv.shape[ax]) {
            outOfBounds = true
            break
          }
          const end = Math.min(start + tileXYZ[ax], lv.shape[ax])
          sel[i] = zarr.slice(start, end)
          validShape[ax] = end - start
          resultAxes.push(ax)
        }
      } else {
        sel[i] = selection[name] ?? 0
      }
    }

    if (outOfBounds) return new ArrayBuffer(totalVoxels * 2)

    try {
      const result = await zarr.get(arr, sel as never)
      if (!isZarrGetResult(result)) {
        throw new Error('openSlice: unexpected zarr.get result')
      }
      return packPlaneToFloat16(
        result.data,
        dtype,
        tileXYZ,
        validShape,
        axisMap,
        resultAxes as [SliceAxis, SliceAxis],
      )
    } catch {
      return new ArrayBuffer(totalVoxels * 2)
    }
  }

  return { info, pyramid, fetch: fetchSlice }
}

/**
 * Pack a 2D plane (data-row major, u-fastest) into a u-fastest r16float
 * buffer of shape `tileXYZ` (slice axis dim = 1). Mirrors the encoding logic
 * in `@galavi/ome-zarr-adapter`'s `toFloat16` for the dtype set we support.
 */
export function packPlaneToFloat16(
  data: ArrayLike<number>,
  dtype: string,
  tileXYZ: [number, number, number],
  validShape: Vec3,
  axisMap: SliceAxisMap,
  resultAxes: [SliceAxis, SliceAxis],
): ArrayBuffer {
  const [uAxis, vAxis] = axisMap
  const tileU = tileXYZ[uAxis]
  const tileV = tileXYZ[vAxis]
  const totalVoxels = tileXYZ[0] * tileXYZ[1] * tileXYZ[2]
  const out = new Uint16Array(totalVoxels)
  const validU = Math.max(0, Math.min(validShape[uAxis], tileU))
  const validV = Math.max(0, Math.min(validShape[vAxis], tileV))
  const sourceFastSize = validShape[resultAxes[1]]

  let offset = 0
  let scale = 1
  if (dtype.includes('uint8') || dtype === '|u1') {
    scale = 1 / 255
  } else if (dtype.includes('uint16') || dtype.includes('<u2') || dtype.includes('>u2')) {
    scale = 1 / 65535
  } else if (dtype.includes('int8') || dtype === '|i1') {
    offset = 128
    scale = 1 / 255
  } else if (dtype.includes('int16') || dtype.includes('<i2') || dtype.includes('>i2')) {
    offset = 32768
    scale = 1 / 65535
  }

  // zarr returns the retained axes in upstream C order. Address by named axis
  // so either natural [v,u] or transposed [u,v] input becomes u-fastest.
  const sourceCoordinate: Vec3 = [0, 0, 0]
  for (let vi = 0; vi < validV; vi++) {
    const dstRow = vi * tileU
    sourceCoordinate[vAxis] = vi
    for (let ui = 0; ui < validU; ui++) {
      sourceCoordinate[uAxis] = ui
      const sourceIndex = sourceCoordinate[resultAxes[0]] * sourceFastSize + sourceCoordinate[resultAxes[1]]
      if (sourceIndex < data.length) {
        out[dstRow + ui] = floatToFloat16((data[sourceIndex] + offset) * scale)
      }
    }
  }
  return out.buffer
}

function floatToFloat16(value: number): number {
  const f32 = new Float32Array(1)
  const i32 = new Int32Array(f32.buffer)
  f32[0] = value
  const f = i32[0]
  const sign = (f >> 31) & 0x0001
  const exp = (f >> 23) & 0x00ff
  const frac = f & 0x007fffff
  if (exp === 0) return 0
  if (exp === 0xff) return (sign << 15) | 0x7c00
  const newE = exp - 127 + 15
  if (newE >= 31) return (sign << 15) | 0x7c00
  if (newE <= 0) return 0
  return (sign << 15) | (newE << 10) | (frac >> 13)
}

function isZarrGetResult(value: unknown): value is ZarrGetResult {
  return typeof value === 'object' && value !== null && 'data' in value
}
