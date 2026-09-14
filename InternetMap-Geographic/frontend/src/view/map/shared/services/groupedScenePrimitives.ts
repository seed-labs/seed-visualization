import { PrimitiveCollection } from 'cesium'

type CesiumItemCollection<T> = {
  add(options?: any): T
  removeAll(): void
  destroy(): void
  isDestroyed(): boolean
}

// Keeps each visibility category under its own PrimitiveCollection so an
// entire node type can be skipped without dirtying every item's GPU data.
export class GroupedScenePrimitives<T> {
  private readonly root = new PrimitiveCollection()
  private readonly groups = new Map<string, { container: PrimitiveCollection; items: CesiumItemCollection<T> }>()
  private readonly orderedItems: T[] = []
  private readonly createCollection: () => CesiumItemCollection<T>

  constructor(createCollection: () => CesiumItemCollection<T>) {
    this.createCollection = createCollection
  }

  get show() { return this.root.show }
  set show(value: boolean) { this.root.show = value }
  get length() { return this.orderedItems.length }
  get(index: number) { return this.orderedItems[index] }

  add(options: any = {}, groupName = 'default', groupShow = true) {
    let group = this.groups.get(groupName)
    if (!group) {
      const container = this.root.add(new PrimitiveCollection())
      container.show = groupShow
      group = { container, items: container.add(this.createCollection()) }
      this.groups.set(groupName, group)
    }
    const item = group.items.add(options)
    this.orderedItems.push(item)
    return item
  }

  setGroupShow(groupName: string, show: boolean) {
    const group = this.groups.get(groupName)
    if (group) group.container.show = show
  }

  removeAll() {
    this.root.removeAll()
    this.groups.clear()
    this.orderedItems.length = 0
  }

  update(frameState: unknown) {
    const primitive = this.root as unknown as { update(state: unknown): void }
    primitive.update(frameState)
  }

  isDestroyed() { return this.root.isDestroyed() }
  destroy() {
    this.groups.clear()
    this.orderedItems.length = 0
    this.root.destroy()
  }
}
