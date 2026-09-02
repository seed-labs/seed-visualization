declare module 'vis-data/declarations/data-interface' {
  export type FullItem<Item, IdProp extends keyof Item = keyof Item> = Item & {
    [Key in IdProp]: Item[Key]
  }
}
