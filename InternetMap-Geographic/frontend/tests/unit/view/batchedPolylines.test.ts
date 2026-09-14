import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cartesian3, PolylineCollection, PrimitiveCollection } from 'cesium'
import { BatchedPolylines } from '@/view/map/shared/services/batchedPolylines'

// jsdom lacks this browser type, which Cesium checks when creating materials.
beforeEach(() => {
  vi.stubGlobal('ImageBitmap', class ImageBitmap {})
  vi.stubGlobal('OffscreenCanvas', class OffscreenCanvas {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('batched topology polylines', () => {
  it('splits large geometry without dropping positions or changing line identity', () => {
    const add = vi.spyOn(PrimitiveCollection.prototype, 'add')
    const lines = new BatchedPolylines()
    const positions = Array.from({ length: 5000 }, (_, i) => new Cartesian3(i, i + 1, i + 2))
    const first = lines.add({ positions, width: 2, id: 'first' })
    const second = lines.add({ positions, width: 3, id: 'second' })
    expect(add.mock.calls.filter(([primitive]) => primitive instanceof PolylineCollection)).toHaveLength(2)
    expect(lines.length).toBe(2)
    expect(lines.get(0)).toBe(first)
    expect(lines.get(1)).toBe(second)
    expect(first.positions).toEqual(positions)
    expect(second.positions).toEqual(positions)
    expect(second.width).toBe(3)
    lines.destroy()
    expect(lines.isDestroyed()).toBe(true)
  })

  it('clears owned batches and allows rebuilding after topology replacement', () => {
    const add = vi.spyOn(PrimitiveCollection.prototype, 'add')
    const lines = new BatchedPolylines()
    const positions = [new Cartesian3(1, 2, 3), new Cartesian3(4, 5, 6)]
    lines.add({ positions })
    const oldBatch = add.mock.calls.find(([primitive]) => primitive instanceof PolylineCollection)![0] as PolylineCollection
    lines.removeAll()
    expect(oldBatch.isDestroyed()).toBe(true)
    expect(lines.length).toBe(0)
    const replacement = lines.add({ positions })
    expect(lines.get(0)).toBe(replacement)
    lines.show = false
    expect(lines.show).toBe(false)
    lines.show = true
    expect(lines.show).toBe(true)
    lines.destroy()
  })
})
