/**
 * Visor-specific OME-Zarr slab opener.
 *
 * The xy/xz/yz precomputed projection slabs are valid OME-Zarr arrays whose
 * "slab axis" indexes a precomputed plane (e.g. xz slab y∈[0..3000] indexes
 * one xz projection per stride along the original y axis). To render one
 * slice plane we need a fetch that:
 *   - reads exactly 1 voxel along the slab axis at the requested index,
 *   - reads a 2D tile along the plane axes,
 *   - returns the result already laid out as the slice layer expects
 *     (u-fastest, where u = axisMap[0], v = axisMap[1]).
 *
 * The standard adapter's `fetchTile` returns a 3D block with a fixed global
 * tileSize (auto-derived as `coarsestShape/3`). For projection slabs the
 * slab axis isn't downsampled, so that derivation gives ~1000 voxels along
 * the slab axis per fetch (huge over-fetch and incorrect 2D unpacking for
 * the xz/yz orientations). Hence this slim re-opener.
 *
 * Only used for slice layers. The 3D volume keeps using the adapter's
 * standard `fetchTile`.
 */

import * as zarr from 'zarrita'
import { openOMEZarr, type OMEZarrInfo } from '@galavi/ome-zarr-adapter'

/** sliceAxis is the slab axis in [x, y, z] order: 0=x, 1=y, 2=z. */
export type SliceAxis = 0 | 1 | 2

export interface Slab {
  /** Underlying adapter info — used for physical transform, channels, scales. */
  info: OMEZarrInfo
  /** 2D plane tile size at adapter axis order [x, y, z]; slab axis is 1. */
  tileSize: [number, number, number]
  /** Custom fetch returning a half-precision r16float buffer ready for the slice layer texture. */
  fetch: (req: {
    level?: number
    position?: number[]
    selection?: Record<string, number>
  }) => Promise<ArrayBuffer>
}

export async function openSlab(url: string, sliceAxis: SliceAxis): Promise<Slab> {
  const info = await openOMEZarr(url)

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
  if (!ms) throw new Error(`openSlab: no multiscales in ${url}`)

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

  // Plane tile size in [x, y, z] order; collapse slab axis to 1.
  const tileXYZ: [number, number, number] = [info.tileSize[0], info.tileSize[1], info.tileSize[2]]
  tileXYZ[sliceAxis] = 1
  const totalVoxels = tileXYZ[0] * tileXYZ[1] * tileXYZ[2]

  const dtype = info.dtype

  const fetchSlab = async (req: {
    level?: number
    position?: number[]
    selection?: Record<string, number>
  }): Promise<ArrayBuffer> => {
    const level = Math.max(0, Math.min(req.level ?? 0, arrays.length - 1))
    const position = req.position ?? [0, 0, 0]
    const selection = req.selection ?? info.defaultSelection
    const lv = info.levels[level]
    const arr = arrays[level]

    // Build per-axis selection in upstream axis order.
    // Plane axes: half-open slices [start, end). Slab axis: scalar at requested plane.
    // Non-spatial axes (c, t, ...): scalar from selection.
    const sel: (number | zarr.Slice)[] = new Array(axes.length)
    let outOfBounds = false
    let validU = 0
    let validV = 0
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
          // The slice layer texture is u-fastest with u = axisMap[0], v = axisMap[1].
          // Because zarr returns C-order (last axis fastest) and our upstream axis
          // order has x last for xy/xz slabs and y after z for yz, the natural
          // result of zarr.get with our slice descriptors already has u-fastest
          // layout matching axisMap. validU = size along the lower-index xyz
          // plane axis, validV = the other.
          if (
            (sliceAxis === 2 && ax === 0) ||
            (sliceAxis === 1 && ax === 0) ||
            (sliceAxis === 0 && ax === 1)
          ) {
            validU = end - start
          } else {
            validV = end - start
          }
        }
      } else {
        sel[i] = selection[name] ?? 0
      }
    }

    if (outOfBounds) return new ArrayBuffer(totalVoxels * 2)

    try {
      const result = await zarr.get(arr, sel as never)
      const data = result.data as ArrayLike<number>
      return packPlaneToFloat16(data, dtype, tileXYZ, validU, validV, sliceAxis)
    } catch {
      return new ArrayBuffer(totalVoxels * 2)
    }
  }

  return { info, tileSize: tileXYZ, fetch: fetchSlab }
}

/**
 * Pack a 2D plane (data-row major, u-fastest) into a u-fastest r16float
 * buffer of shape `tileXYZ` (slab axis dim = 1). Mirrors the encoding logic
 * in `@galavi/ome-zarr-adapter`'s `toFloat16` for the dtype set we support.
 */
function packPlaneToFloat16(
  data: ArrayLike<number>,
  dtype: string,
  tileXYZ: [number, number, number],
  validU: number,
  validV: number,
  sliceAxis: SliceAxis,
): ArrayBuffer {
  // tileU/tileV along the destination buffer's u-fastest layout.
  const tileU = sliceAxis === 0 ? tileXYZ[1] : tileXYZ[0]
  const tileV = sliceAxis === 2 ? tileXYZ[1] : tileXYZ[2]
  const totalVoxels = tileXYZ[0] * tileXYZ[1] * tileXYZ[2]
  const out = new Uint16Array(totalVoxels)
  const u = Math.max(0, Math.min(validU, tileU))
  const v = Math.max(0, Math.min(validV, tileV))
  const len = Math.min(data.length, u * v)

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

  // C-order plane is (v-major, u-fastest); destination is also u-fastest.
  let src = 0
  for (let vi = 0; vi < v; vi++) {
    const dstRow = vi * tileU
    for (let ui = 0; ui < u && src < len; ui++, src++) {
      out[dstRow + ui] = floatToFloat16((data[src] + offset) * scale)
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
