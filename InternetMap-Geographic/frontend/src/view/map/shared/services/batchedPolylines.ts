import { PolylineCollection, PrimitiveCollection } from 'cesium'

// PolylineCollection builds command lists by walking all of its polylines for
// each vertex-array bucket. Bound each collection's geometry to avoid repeated
// scans across a large topology. Curves and material values are unchanged.
const POSITION_BUDGET = 8192
type PolylineOptions = Parameters<PolylineCollection['add']>[0]
type Line = ReturnType<PolylineCollection['add']>
type BatchGroup = {
  collection: PrimitiveCollection
  current?: PolylineCollection
  positionCount: number
}

export class BatchedPolylines {
  private readonly batches = new PrimitiveCollection()
  private readonly lines: Line[] = []
  private readonly groups = new Map<string, BatchGroup>()

  get show() { return this.batches.show }
  set show(value: boolean) { this.batches.show = value }
  get length() { return this.lines.length }
  get(index: number) { return this.lines[index] }

  add(options: PolylineOptions = {}, groupName = 'default', groupShow = true) {
    let group = this.groups.get(groupName)
    if (!group) {
      group = { collection: this.batches.add(new PrimitiveCollection()), positionCount: 0 }
      group.collection.show = groupShow
      this.groups.set(groupName, group)
    }
    const count = options.positions?.length ?? 0
    if (!group.current || group.positionCount + count > POSITION_BUDGET) {
      group.current = group.collection.add(new PolylineCollection())
      group.positionCount = 0
    }
    const line = group.current!.add(options)
    group.positionCount += count
    this.lines.push(line)
    return line
  }

  setGroupShow(groupName: string, show: boolean) {
    const group = this.groups.get(groupName)
    if (group) group.collection.show = show
  }

  getGroupShow(groupName: string) {
    return this.groups.get(groupName)?.collection.show
  }

  removeAll() {
    this.batches.removeAll()
    this.lines.length = 0
    this.groups.clear()
  }

  // Cesium invokes update for custom scene primitives; pass through the same
  // frame state so color rendering, picking, and 2D projection stay intact.
  update(frameState: unknown) {
    // update is part of Cesium's runtime primitive interface but not its typings.
    const primitive = this.batches as unknown as { update(state: unknown): void }
    primitive.update(frameState)
  }

  isDestroyed() { return this.batches.isDestroyed() }
  destroy() {
    this.lines.length = 0
    this.groups.clear()
    this.batches.destroy()
  }
}
