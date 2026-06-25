import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createGlobeGraph, type GlobeGraph, type GlobeNode } from '@/view/map/uploadMap/services/globeGraph'
import { filterGraphByIXRoutersData } from '@/view/map/uploadMap/ui'
import { DataSource } from '@/view/map/ixMap/datasource'
import { augmentAsHighlight, isTransitRouter, waitForBrowserPaint } from '@/view/map/shared/map3dGraph'

export function useIxMap3DUi() {
  const datasource = new DataSource()
  const nodeScale = ref(2)
  const showRouterLabels = ref(true)
  const settingsOpen = ref(false)
  const loadingVisible = ref(true)
  const graph = ref<GlobeGraph>({ nodes: [], edges: [] })
  const ixOptions = ref<{ label: string; value: string }[]>([])
  const selectedIxLabels = ref<string[]>([])
  const expandedRouterParentIds = ref<string[]>([])
  const ixCount = ref(0)
  const orientToInitialNode = ref(true)
  const waitingForGraphRender = ref(false)
  const selectedAsn = ref<string>()
  const selectedAsSourceId = ref<string>()

  const ixCountMax = computed(() => ixOptions.value.length)

  function setIxOptions() {
    ixOptions.value = datasource.ixs
      .map((ix) => ({
        label: ix.meta?.emulatorInfo?.displayname || ix.meta?.emulatorInfo?.name,
        value: ix.meta?.emulatorInfo?.name,
      }))
      .filter((item): item is { label: string; value: string } => Boolean(item.label && item.value))

    selectedIxLabels.value = ixOptions.value.map((item) => item.value)
    ixCount.value = ixOptions.value.length
  }

  function renderSelectedIX() {
    const { filteredNodes, filteredEdges } = filterGraphByIXRoutersData(
      datasource.vertices,
      datasource.edges,
      selectedIxLabels.value,
    )
    const baseGraph = createGlobeGraph(filteredNodes, filteredEdges)
    graph.value = selectedAsn.value
      ? augmentAsHighlight(baseGraph, datasource.vertices, datasource.edges, selectedAsn.value, selectedAsSourceId.value)
      : baseGraph
  }

  async function renderWithLoading(orientToGraph = true) {
    loadingVisible.value = true
    await nextTick()
    await waitForBrowserPaint()

    try {
      orientToInitialNode.value = orientToGraph
      waitingForGraphRender.value = true
      renderSelectedIX()
      if (graph.value.nodes.length === 0) {
        ElMessage.warning('No IX nodes were found.')
      }
    } catch (error) {
      console.error('IXMap3D graph calculation failed:', error)
      ElMessage.error('IXMap3D graph calculation failed.')
      waitingForGraphRender.value = false
      loadingVisible.value = false
    }
  }

  async function loadMap() {
    loadingVisible.value = true
    orientToInitialNode.value = true
    waitingForGraphRender.value = false
    graph.value = { nodes: [], edges: [] }
    selectedIxLabels.value = []
    expandedRouterParentIds.value = []
    ixCount.value = 0
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined

    try {
      await datasource.connect()
      setIxOptions()
      await renderWithLoading()
    } catch (error) {
      console.error('IXMap3D loading failed:', error)
      ElMessage.error('IXMap3D loading failed.')
      loadingVisible.value = false
    }
  }

  function applyIxCount(value: number | undefined) {
    const count = Math.max(0, Math.min(value ?? 0, ixOptions.value.length))
    selectedIxLabels.value = ixOptions.value.slice(0, count).map((item) => item.value)
    expandedRouterParentIds.value = []
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
  }

  function applyIxSelection() {
    ixCount.value = selectedIxLabels.value.length
    expandedRouterParentIds.value = []
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
  }

  async function onGlobeNodeClick(node: GlobeNode) {
    if (node.kind === 'star') {
      if (expandedRouterParentIds.value.includes(node.id)) {
        expandedRouterParentIds.value = expandedRouterParentIds.value.filter((id) => id !== node.id)
      } else {
        expandedRouterParentIds.value = [...expandedRouterParentIds.value, node.id]
      }
      return
    }

    if (node.kind !== 'dot' || !node.sourceId) {
      ElMessage.warning('Please select an AS router node.')
      return
    }

    const vertex = datasource.vertices.find((item) => item.id === node.sourceId)
    if (!isTransitRouter(vertex)) {
      ElMessage.warning('Please select an AS router node.')
      return
    }

    const asn = vertex?.group
    if (!asn) {
      ElMessage.warning('Please select an AS router node.')
      return
    }

    if (selectedAsn.value === String(asn)) {
      selectedAsn.value = undefined
      selectedAsSourceId.value = undefined
    } else {
      selectedAsn.value = String(asn)
      selectedAsSourceId.value = node.sourceId
    }
    await renderWithLoading(false)
  }

  function onGlobeRendered(renderedGraph: GlobeGraph) {
    if (!waitingForGraphRender.value) return
    if (renderedGraph !== graph.value) return

    waitingForGraphRender.value = false
    loadingVisible.value = false
    if (orientToInitialNode.value && graph.value.nodes.length > 0) {
      orientToInitialNode.value = false
    }
  }

  onMounted(() => {
    loadMap()
  })

  onBeforeUnmount(() => {
    try {
      datasource.disconnect()
    } catch {
      // The datasource may fail before sockets are opened.
    }
  })

  return {
    nodeScale,
    showRouterLabels,
    settingsOpen,
    loadingVisible,
    graph,
    ixOptions,
    selectedIxLabels,
    expandedRouterParentIds,
    ixCount,
    orientToInitialNode,
    ixCountMax,
    loadMap,
    renderWithLoading,
    applyIxCount,
    applyIxSelection,
    onGlobeRendered,
    onGlobeNodeClick,
  }
}
