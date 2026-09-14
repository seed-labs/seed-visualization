import type { TopologySearchSuggestion } from '@/view/map/shared/services/topologySearch'

export type EmulatorTopologyDockPage = 'overview' | 'settings' | 'traffic'

export type EmulatorTopologyCommonStats = {
  autonomousSystems: number
  ix: number
  networks: number
  routers: number
  hosts: number
  renderedNodes: number
  renderedLinks: number
}

export type EmulatorTopologyAsSummary = {
  asn: string
  routers: number
  hosts: number
}

export type EmulatorTopologyIxSummary = {
  name: string
  label: string
}

export type EmulatorTopologyAsDetail = {
  name: string
  role: string
  nets: string
}

export type EmulatorTopologySelectedNodeSummary = {
  id: string
  label: string
  type: string
  group: string
  position: string
}

export type EmulatorTopologyVisibleTypesModel = {
  ix: boolean
  network: boolean
  router: boolean
  host: boolean
}

export type TopologySearchSuggestionProvider = (
  query: string,
  callback: (suggestions: TopologySearchSuggestion[]) => void,
) => void
