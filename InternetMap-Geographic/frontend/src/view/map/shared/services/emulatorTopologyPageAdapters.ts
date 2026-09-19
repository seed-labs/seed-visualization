import { reqGetContainersList, reqGetNetworksList } from '@/api/map'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import { PacketReplayWorkerClient } from './packetReplayWorkerClient'
import { fetchTrafficObserverFilter, setTrafficObserverFilter, TrafficObserverClient } from './trafficObserverService'
import type { EmulatorTopologyPacketReplayEvent } from './packetReplayFileService'

export type EmulatorTopologyDataSource =
  | { kind: 'live'; load: () => Promise<{ nodes: EmulatorNode[]; nets: EmulatorNetwork[] }> }
  | { kind: 'upload' }

export type EmulatorTrafficSource =
  | {
      kind: 'live'
      getFilter: typeof fetchTrafficObserverFilter
      setFilter: typeof setTrafficObserverFilter
      createClient: (
        onPacket: (packet: EmulatorTopologyPacketReplayEvent) => void,
        onError: () => void,
      ) => TrafficObserverClient
    }
  | { kind: 'upload'; replayWorker: PacketReplayWorkerClient }

export function createLiveTopologySource(): EmulatorTopologyDataSource {
  return {
    kind: 'live',
    async load() {
      const [containers, networks] = await Promise.all([reqGetContainersList({}), reqGetNetworksList({})])
      if (!containers.ok) throw new Error('Failed to load emulator containers.')
      if (!networks.ok) throw new Error('Failed to load emulator networks.')
      return {
        nodes: containers.result as EmulatorNode[],
        nets: networks.result as EmulatorNetwork[],
      }
    },
  }
}

export const createUploadTopologySource = (): EmulatorTopologyDataSource => ({ kind: 'upload' })

export function createLiveTrafficSource(): EmulatorTrafficSource {
  return {
    kind: 'live',
    getFilter: fetchTrafficObserverFilter,
    setFilter: setTrafficObserverFilter,
    createClient: (onPacket, onError) => new TrafficObserverClient(onPacket, onError),
  }
}

export const createUploadTrafficSource = (): EmulatorTrafficSource => ({
  kind: 'upload',
  replayWorker: new PacketReplayWorkerClient(),
})
