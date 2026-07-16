import { cameraDistance, type Camera, type State, type Vec2, type Vec3 } from 'galavi'
import { sliceDef, type SlicePlane } from '@/galavi-setup'

const PERSPECTIVE_HALF_FOV_TAN = Math.tan(Math.PI / 8)

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function cross(first: Vec3, second: Vec3): Vec3 {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ]
}

function dot(first: Vec3, second: Vec3): number {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

export function physicalToSliceScreen(
  position: Vec3,
  state: State,
  plane: SlicePlane,
  width: number,
  height: number,
): Vec2 {
  const axes = sliceDef(plane).axisMap
  const distance = cameraDistance(state.exploration.camera)
  const halfExtent = Math.max(distance / 2, 1e-6)
  const aspect = width / Math.max(height, 1)
  const target = state.exploration.camera.target
  const clipX = (position[axes[0]] - target[axes[0]]) / (halfExtent * aspect)
  const clipY = (position[axes[1]] - target[axes[1]]) / halfExtent
  return [(clipX * 0.5 + 0.5) * width, (clipY * 0.5 + 0.5) * height]
}

export function screenToSlicePhysical(
  screenX: number,
  screenY: number,
  state: State,
  plane: SlicePlane,
  width: number,
  height: number,
  normalPosition: number,
): Vec3 {
  const axes = sliceDef(plane).axisMap
  const distance = cameraDistance(state.exploration.camera)
  const halfExtent = Math.max(distance / 2, 1e-6)
  const aspect = width / Math.max(height, 1)
  const clipX = (screenX / Math.max(width, 1)) * 2 - 1
  const clipY = (screenY / Math.max(height, 1)) * 2 - 1
  const target = state.exploration.camera.target
  const result = [...target] as Vec3
  result[axes[0]] = target[axes[0]] + clipX * halfExtent * aspect
  result[axes[1]] = target[axes[1]] + clipY * halfExtent
  result[axes[2]] = normalPosition
  return result
}

function cameraBasis(camera: Camera): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward = normalize([
    camera.target[0] - camera.position[0],
    camera.target[1] - camera.position[1],
    camera.target[2] - camera.position[2],
  ])
  const right = normalize(cross(forward, (camera.up ?? [0, 1, 0]) as Vec3))
  const up = normalize(cross(right, forward))
  return { forward, right, up }
}

export function physicalToVolumeScreen(
  position: Vec3,
  camera: Camera,
  width: number,
  height: number,
): Vec2 | null {
  const { forward, right, up } = cameraBasis(camera)
  const relative: Vec3 = [
    position[0] - camera.position[0],
    position[1] - camera.position[1],
    position[2] - camera.position[2],
  ]
  const depth = dot(relative, forward)
  if (depth <= 1e-6) return null
  const halfHeight = Math.max(depth * PERSPECTIVE_HALF_FOV_TAN, 1e-6)
  const halfWidth = halfHeight * width / Math.max(height, 1)
  const clipX = dot(relative, right) / halfWidth
  const clipY = -dot(relative, up) / halfHeight
  return [(clipX * 0.5 + 0.5) * width, (clipY * 0.5 + 0.5) * height]
}

export function screenToVolumeTargetPlane(
  screenX: number,
  screenY: number,
  camera: Camera,
  width: number,
  height: number,
): Vec3 {
  const { forward, right, up } = cameraBasis(camera)
  const clipX = (screenX / Math.max(width, 1)) * 2 - 1
  const clipY = (screenY / Math.max(height, 1)) * 2 - 1
  const aspect = width / Math.max(height, 1)
  const direction = normalize([
    forward[0] + right[0] * clipX * PERSPECTIVE_HALF_FOV_TAN * aspect - up[0] * clipY * PERSPECTIVE_HALF_FOV_TAN,
    forward[1] + right[1] * clipX * PERSPECTIVE_HALF_FOV_TAN * aspect - up[1] * clipY * PERSPECTIVE_HALF_FOV_TAN,
    forward[2] + right[2] * clipX * PERSPECTIVE_HALF_FOV_TAN * aspect - up[2] * clipY * PERSPECTIVE_HALF_FOV_TAN,
  ])
  const targetOffset: Vec3 = [
    camera.target[0] - camera.position[0],
    camera.target[1] - camera.position[1],
    camera.target[2] - camera.position[2],
  ]
  const distance = dot(targetOffset, forward) / Math.max(dot(direction, forward), 1e-6)
  return [
    camera.position[0] + direction[0] * distance,
    camera.position[1] + direction[1] * distance,
    camera.position[2] + direction[2] * distance,
  ]
}

export function volumeUnitsPerPixel(camera: Camera, viewportHeight: number): number {
  return 2 * cameraDistance(camera) * PERSPECTIVE_HALF_FOV_TAN / Math.max(viewportHeight, 1)
}