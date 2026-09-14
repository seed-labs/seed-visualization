<template>
  <section class="topology-node-hover-card" :style="cardStyle" @pointerdown.stop>
    <header>
      <span>{{ title }}</span>
    </header>

    <dl class="topology-node-hover-card__rows">
      <template v-for="row in rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>

    <section v-if="nodeIpRows.length" class="topology-node-hover-card__section">
      <h4>IP addresses</h4>
      <dl class="topology-node-hover-card__rows">
        <template v-for="row in nodeIpRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="showBgpSessions" class="topology-node-hover-card__section">
      <h4>BGP sessions</h4>
      <p v-if="bgpLoading" class="topology-node-hover-card__hint">Loading BGP sessions...</p>
      <p v-else-if="bgpError" class="topology-node-hover-card__error">{{ bgpError }}</p>
      <p v-else-if="!bgpPeers.length" class="topology-node-hover-card__hint">No BGP sessions.</p>
      <dl v-else class="topology-node-hover-card__rows topology-node-hover-card__bgp">
        <template v-for="peer in bgpPeers" :key="peer.name">
          <dt>{{ peer.name }}</dt>
          <dd>
            <span>{{ getBgpPeerStatus(peer) }}</span>
            <button
              type="button"
              class="topology-node-hover-card__link"
              :disabled="actionBusy"
              @click="toggleBgpPeer(peer)"
            >
              {{ getBgpPeerActionText(peer) }}
            </button>
          </dd>
        </template>
      </dl>
    </section>

    <section v-if="actionsAvailable" class="topology-node-hover-card__section">
      <h4>Actions</h4>
      <div class="topology-node-hover-card__actions">
        <button type="button" class="topology-node-hover-card__link" @click="launchConsole">
          Launch console
        </button>
        <button
          type="button"
          class="topology-node-hover-card__link"
          :disabled="networkStatus === undefined || actionBusy"
          @click="toggleNetworkStatus"
        >
          {{ networkStatus === false ? 'Re-connect' : 'Disconnect' }}
        </button>
        <button
          type="button"
          class="topology-node-hover-card__link"
          :disabled="actionBusy"
          @click="refreshRuntimeInfo"
        >
          Refresh
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  reqGetBgpPeers,
  reqGetNetworkStatus,
  reqSetBgpPeer,
  reqSetNetworkStatus,
} from '@/api/map'
import type { BgpPeer, EmulatorNetwork, EmulatorNode } from '@/utils/types'
import type { GlobeNode } from '@/view/map/shared/services/globeGraph'

const props = withDefaults(defineProps<{
  node: GlobeNode
  position: { x: number; y: number }
  actionsEnabled?: boolean
}>(), {
  actionsEnabled: false,
})

const emit = defineEmits<{
  refresh: []
  launchConsole: [nodeId: string, title: string]
}>()

const bgpPeers = ref<BgpPeer[]>([])
const bgpLoading = ref(false)
const bgpError = ref('')
const networkStatus = ref<boolean | undefined>(undefined)
const actionBusy = ref(false)

let runtimeInfoRequestId = 0

function shortId(value: string | undefined) {
  return value ? value.slice(0, 12) : '-'
}

function isEmulatorNode(value: unknown): value is EmulatorNode {
  const node = value as EmulatorNode | undefined
  return Boolean(node?.meta?.emulatorInfo?.nets && Array.isArray(node.meta.emulatorInfo.nets))
}

function isEmulatorNetwork(value: unknown): value is EmulatorNetwork {
  const network = value as EmulatorNetwork | undefined
  return Boolean(network?.meta?.emulatorInfo && 'prefix' in network.meta.emulatorInfo)
}

function isRouterLike(role: string | undefined) {
  return role === 'Router' || role === 'BorderRouter' || role === 'Route Server'
}

function getContainerTitleRole(role: string | undefined) {
  return isRouterLike(role) ? 'Router' : 'Host'
}

function getBgpPeerStatus(peer: BgpPeer) {
  return peer.protocolState === 'down' ? 'Disabled' : (peer.bgpState || '-')
}

function getBgpPeerActionText(peer: BgpPeer) {
  return peer.protocolState === 'down' ? 'Enable' : 'Disable'
}

const emulatorNode = computed(() => {
  const object = props.node.object
  return isEmulatorNode(object) ? object : undefined
})

const emulatorNetwork = computed(() => {
  const object = props.node.object
  return isEmulatorNetwork(object) ? object : undefined
})

const emulatorNodeInfo = computed(() => emulatorNode.value?.meta.emulatorInfo)

const actionsAvailable = computed(() => {
  const info = emulatorNodeInfo.value
  return Boolean(props.actionsEnabled && emulatorNode.value && info?.custom !== 'custom')
})

const showBgpSessions = computed(() => {
  return Boolean(actionsAvailable.value && isRouterLike(emulatorNodeInfo.value?.role))
})

const title = computed(() => {
  const node = emulatorNode.value
  if (node) {
    const role = getContainerTitleRole(node.meta.emulatorInfo.role)
    return `${role}: ${props.node.label}`
  }
  const network = emulatorNetwork.value
  if (network) {
    return `${network.meta.emulatorInfo.type === 'global' ? 'Exchange' : 'Network'}: ${props.node.label}`
  }
  return props.node.label
})

const rows = computed(() => {
  const node = emulatorNode.value
  if (node) {
    const info = node.meta.emulatorInfo
    return [
      { label: 'ID', value: shortId(node.Id) },
      { label: 'ASN', value: String(info.asn ?? '-') },
      { label: 'Name', value: info.name || '-' },
      { label: 'Role', value: info.role || '-' },
    ]
  }

  const network = emulatorNetwork.value
  if (network) {
    const info = network.meta.emulatorInfo
    return [
      { label: 'ID', value: shortId(network.Id) },
      { label: 'Type', value: info.type || '-' },
      { label: 'Scope', value: info.scope || '-' },
      { label: 'Name', value: info.name || '-' },
      { label: 'Prefix', value: info.prefix || '-' },
    ]
  }

  return [
    { label: 'ID', value: props.node.sourceId ?? props.node.id },
    { label: 'Type', value: props.node.kind },
    { label: 'Group', value: props.node.group || '-' },
    { label: 'Position', value: `${props.node.lat.toFixed(4)}, ${props.node.lon.toFixed(4)}` },
  ]
})

const nodeIpRows = computed(() => {
  const info = emulatorNodeInfo.value
  if (!info) return []
  return info.nets.map((net) => ({
    label: net.name,
    value: net.address || '-',
  }))
})

const cardStyle = computed(() => {
  const width = 340
  const height = actionsAvailable.value || showBgpSessions.value ? 520 : 320
  const left = Math.min(props.position.x + 16, window.innerWidth - width - 12)
  const top = Math.min(props.position.y + 16, window.innerHeight - height - 12)
  return {
    left: `${Math.max(12, left)}px`,
    top: `${Math.max(12, top)}px`,
  }
})

async function loadRuntimeInfo() {
  const node = emulatorNode.value
  const requestId = ++runtimeInfoRequestId
  bgpPeers.value = []
  bgpError.value = ''
  networkStatus.value = undefined

  if (!node || !actionsAvailable.value) return

  const tasks: Promise<void>[] = [
    reqGetNetworkStatus(node.Id)
      .then((response) => {
        if (requestId === runtimeInfoRequestId) networkStatus.value = response.result
      })
      .catch(() => {
        if (requestId === runtimeInfoRequestId) networkStatus.value = undefined
      }),
  ]

  if (showBgpSessions.value) {
    bgpLoading.value = true
    tasks.push(
      reqGetBgpPeers(node.Id)
        .then((response) => {
          if (requestId === runtimeInfoRequestId) bgpPeers.value = response.result || []
        })
        .catch(() => {
          if (requestId === runtimeInfoRequestId) bgpError.value = 'Failed to load BGP sessions.'
        })
        .finally(() => {
          if (requestId === runtimeInfoRequestId) bgpLoading.value = false
        }),
    )
  } else {
    bgpLoading.value = false
  }

  await Promise.allSettled(tasks)
}

async function refreshRuntimeInfo() {
  await loadRuntimeInfo()
  emit('refresh')
}

async function toggleBgpPeer(peer: BgpPeer) {
  const node = emulatorNode.value
  if (!node) return
  const enabled = peer.protocolState === 'down'
  actionBusy.value = true
  try {
    await reqSetBgpPeer(node.Id, peer.name, enabled)
    ElMessage.success(`${enabled ? 'Enabled' : 'Disabled'} ${peer.name}`)
    await loadRuntimeInfo()
  } catch {
    ElMessage.error(`Failed to ${enabled ? 'enable' : 'disable'} ${peer.name}`)
  } finally {
    actionBusy.value = false
  }
}

async function toggleNetworkStatus() {
  const node = emulatorNode.value
  if (!node || networkStatus.value === undefined) return
  const enabled = !networkStatus.value
  actionBusy.value = true
  try {
    await reqSetNetworkStatus(node.Id, enabled)
    ElMessage.success(enabled ? 'Container re-connected.' : 'Container disconnected.')
    await loadRuntimeInfo()
    emit('refresh')
  } catch {
    ElMessage.error(enabled ? 'Failed to re-connect container.' : 'Failed to disconnect container.')
  } finally {
    actionBusy.value = false
  }
}

function launchConsole() {
  const node = emulatorNode.value
  if (!node) return
  emit('launchConsole', node.Id, props.node.label)
}

watch(
  () => [emulatorNode.value?.Id, props.actionsEnabled],
  () => {
    void loadRuntimeInfo()
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.topology-node-hover-card {
  position: fixed;
  z-index: 30;
  width: 340px;
  max-height: min(520px, calc(100vh - 24px));
  overflow: auto;
  padding: 14px 16px;
  pointer-events: auto;
  color: #d9f3ff;
  border: 1px solid rgba(70, 190, 255, 0.36);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(4, 15, 25, 0.96), rgba(7, 29, 43, 0.92));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34), 0 0 22px rgba(48, 188, 255, 0.16);
  backdrop-filter: blur(10px);

  header {
    display: grid;
    gap: 3px;
    margin-bottom: 12px;

    span {
      font-size: 14px;
      font-weight: 800;
      color: #ffffff;
    }
  }
}

.topology-node-hover-card__section {
  margin-top: 14px;

  h4 {
    margin: 0 0 9px;
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
  }
}

.topology-node-hover-card__rows {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px 10px;
  margin: 0;
  font-size: 12px;

  dt {
    color: rgba(166, 205, 225, 0.72);
  }

  dd {
    min-width: 0;
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: #eaf9ff;
  }
}

.topology-node-hover-card__bgp dd {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.topology-node-hover-card__actions {
  display: grid;
  justify-items: start;
  gap: 9px;
}

.topology-node-hover-card__link {
  padding: 0;
  border: none;
  color: #55c8ff;
  background: transparent;
  font: inherit;
  line-height: 1.4;
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: #ffffff;
  }

  &:disabled {
    color: rgba(166, 205, 225, 0.42);
    cursor: not-allowed;
  }
}

.topology-node-hover-card__hint,
.topology-node-hover-card__error {
  margin: 0;
  font-size: 12px;
  color: rgba(166, 205, 225, 0.72);
}

.topology-node-hover-card__error {
  color: #ff9b9b;
}
</style>
