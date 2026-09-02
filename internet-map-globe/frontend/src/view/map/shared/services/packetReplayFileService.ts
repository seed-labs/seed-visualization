import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'

const PCAP_MAGIC_LE = 0xa1b2c3d4
const PCAP_MAGIC_BE = 0xd4c3b2a1
const PCAP_GLOBAL_HEADER_LENGTH = 24
const PCAP_PACKET_HEADER_LENGTH = 16
const ETHERTYPE_IPV4 = 0x0800
const PROTO_ICMP = 1
const PROTO_IGMP = 2
const PROTO_TCP = 6
const PROTO_EGP = 8
const PROTO_IGP = 9
const PROTO_UDP = 17
const PROTO_IPV6 = 41
const PROTO_GRE = 47
const PROTO_ESP = 50
const PROTO_AH = 51
const PROTO_ICMPV6 = 58
const PROTO_OSPF = 89
const PROTO_SCTP = 132

const PROTOCOL_BY_NAME: Record<string, number> = {
  ah: PROTO_AH,
  egp: PROTO_EGP,
  esp: PROTO_ESP,
  gre: PROTO_GRE,
  icmp: PROTO_ICMP,
  icmp6: PROTO_ICMPV6,
  icmpv6: PROTO_ICMPV6,
  igmp: PROTO_IGMP,
  igp: PROTO_IGP,
  ipv6: PROTO_IPV6,
  ospf: PROTO_OSPF,
  sctp: PROTO_SCTP,
  tcp: PROTO_TCP,
  udp: PROTO_UDP,
}

export type EmulatorTopologyPacketReplayEvent = {
  timestampMs: number
  timestampNs?: number | string
  containerId: string
  containerName?: string
  ifName?: string
  nodeLabel?: string
  nodeName?: string
  nodeIp?: string
  networkId?: string
  networkName?: string
  networkLabel?: string
  sourceIp?: string
  destIp?: string
  ipProtocol?: string
  ipProtocolNumber?: number
  flowId?: string
  packetId?: string
  packetRole?: string
  packetKind?: string
  sourcePort?: number
  destPort?: number
  icmpType?: number
  icmpCode?: number
  icmpId?: number
  icmpSeq?: number
  tcpSeq?: number
  tcpAck?: number
  tcpFlags?: string
  sourceContainerId?: string
  sourceContainerName?: string
  sourceNodeName?: string
  sourceNodeIp?: string
  destContainerId?: string
  destContainerName?: string
  destNodeName?: string
  destNodeIp?: string
}

export type EmulatorTopologyPacketReplayImportResult = {
  events: EmulatorTopologyPacketReplayEvent[]
  fileType: 'json' | 'pcap'
  remappedCount: number
  skippedCount: number
}

export type EmulatorTopologyPacketReplayImportOptions = {
  sort?: boolean
}

export type EmulatorTopologyPcapPacket = {
  index: number
  timestampMs: number
  timestampNs: string
  sourceIp?: string
  destIp?: string
  ipProtocol?: string
  ipProtocolNumber?: number
  sourcePort?: number
  destPort?: number
}

export type EmulatorTopologyPcapParseResult = {
  packets: EmulatorTopologyPcapPacket[]
  skippedCount: number
}

export type EmulatorTopologyOfflineFilterResult = {
  events: EmulatorTopologyPacketReplayEvent[]
  matchedPacketCount: number
  skippedPacketCount: number
}

export async function importEmulatorTopologyPacketReplayFile(
  file: File,
  containers: EmulatorNode[],
  networks: EmulatorNetwork[] = [],
  options: EmulatorTopologyPacketReplayImportOptions = {},
): Promise<EmulatorTopologyPacketReplayImportResult> {
  if (file.name.toLowerCase().endsWith('.json')) {
    return parsePacketReplayJSON(await file.text(), containers, networks, options)
  }

  const buffer = await file.arrayBuffer()
  if (file.name.toLowerCase().endsWith('.pcap') || looksLikePcap(buffer)) {
    return parsePacketReplayPCAP(buffer, containers, networks, options)
  }

  return parsePacketReplayJSON(new TextDecoder().decode(buffer), containers, networks, options)
}

function parsePacketReplayJSON(
  text: string,
  containers: EmulatorNode[],
  networks: EmulatorNetwork[],
  options: EmulatorTopologyPacketReplayImportOptions = {},
): EmulatorTopologyPacketReplayImportResult {
  const parsed = JSON.parse(text) as unknown
  const rawMessages = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.events)
      ? parsed.events
      : isRecord(parsed) && Array.isArray(parsed.packets)
        ? parsed.packets
        : []
  const events: EmulatorTopologyPacketReplayEvent[] = []
  let remappedCount = 0
  let skippedCount = 0

  rawMessages.forEach((value) => {
    const message = normalizeJSONPacket(value)
    if (!message) {
      skippedCount += 1
      return
    }

    const remapped = remapEmulatorTopologyPacketReplayEvent(message, containers, networks)
    if (!remapped.containerId) {
      skippedCount += 1
      return
    }
    if (remapped.containerId !== message.containerId || remapped.containerName !== message.containerName) {
      remappedCount += 1
    }
    events.push(remapped)
  })

  return {
    events: options.sort === false ? events : sortPacketReplayEvents(events),
    fileType: 'json',
    remappedCount,
    skippedCount,
  }
}

function parsePacketReplayPCAP(
  buffer: ArrayBuffer,
  containers: EmulatorNode[],
  networks: EmulatorNetwork[],
  options: EmulatorTopologyPacketReplayImportOptions = {},
): EmulatorTopologyPacketReplayImportResult {
  const result = parseEmulatorTopologyPcapPackets(buffer)
  const events: EmulatorTopologyPacketReplayEvent[] = []
  let skippedCount = result.skippedCount
  result.packets.forEach((packet) => {
    const remapped = remapEmulatorTopologyPacketReplayEvent({
      containerId: '',
      ...packet,
    }, containers, networks)

    if (!remapped.containerId) {
      skippedCount += 1
      return
    }

    events.push(remapped)
  })

  return {
    events: options.sort === false ? events : sortPacketReplayEvents(events),
    fileType: 'pcap',
    remappedCount: events.length,
    skippedCount,
  }
}

export async function parseEmulatorTopologyPcapFile(file: File): Promise<EmulatorTopologyPcapParseResult> {
  return parseEmulatorTopologyPcapPackets(await file.arrayBuffer())
}

export function parseEmulatorTopologyPcapPackets(buffer: ArrayBuffer): EmulatorTopologyPcapParseResult {
  const view = new DataView(buffer)
  if (view.byteLength < PCAP_GLOBAL_HEADER_LENGTH) {
    throw new Error('Invalid pcap file: global header is missing.')
  }

  const magic = view.getUint32(0, true)
  const littleEndian = magic === PCAP_MAGIC_LE
    ? true
    : view.getUint32(0, false) === PCAP_MAGIC_BE
      ? false
      : undefined
  if (littleEndian === undefined) {
    throw new Error('Invalid pcap file: unsupported magic number.')
  }

  const packets: EmulatorTopologyPcapPacket[] = []
  let offset = PCAP_GLOBAL_HEADER_LENGTH
  let skippedCount = 0
  let packetIndex = 0

  while (offset + PCAP_PACKET_HEADER_LENGTH <= view.byteLength) {
    const seconds = view.getUint32(offset, littleEndian)
    const micros = view.getUint32(offset + 4, littleEndian)
    const includedLength = view.getUint32(offset + 8, littleEndian)
    offset += PCAP_PACKET_HEADER_LENGTH

    if (includedLength <= 0 || offset + includedLength > view.byteLength) {
      skippedCount += 1
      break
    }

    const packet = parseEthernetIPv4Packet(view, offset, includedLength)
    offset += includedLength

    if (!packet) {
      skippedCount += 1
      packetIndex += 1
      continue
    }

    packets.push({
      index: packetIndex,
      timestampMs: seconds * 1000 + Math.floor(micros / 1000),
      timestampNs: String(BigInt(seconds) * 1_000_000_000n + BigInt(micros) * 1_000n),
      ...packet,
    })
    packetIndex += 1
  }

  return { packets, skippedCount }
}

export function filterEmulatorTopologyPacketReplayEventsByPcap(
  eventsByOriginalIndex: EmulatorTopologyPacketReplayEvent[],
  pcapPackets: EmulatorTopologyPcapPacket[],
  filterExpression: string,
): EmulatorTopologyOfflineFilterResult {
  const filter = parseOfflinePacketFilter(filterExpression)
  const matchedPackets = pcapPackets.filter((packet) => matchesOfflinePacketFilter(packet, filter))
  const events = matchedPackets
    .map((packet) => eventsByOriginalIndex[packet.index])
    .filter((event): event is EmulatorTopologyPacketReplayEvent => Boolean(event))

  return {
    events,
    matchedPacketCount: matchedPackets.length,
    skippedPacketCount: matchedPackets.length - events.length,
  }
}

type OfflinePacketFilter = {
  protocols: Set<number>
  hasExpression: boolean
  recognizedTokens: number
  host?: string
  srcHost?: string
  dstHost?: string
  port?: number
  srcPort?: number
  dstPort?: number
}

function parseOfflinePacketFilter(expression: string): OfflinePacketFilter {
  const filter: OfflinePacketFilter = {
    protocols: new Set(),
    hasExpression: Boolean(expression.trim()),
    recognizedTokens: 0,
  }
  const tokens = expression
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]
    const afterNext = tokens[index + 2]

    const protocolNumber = parseProtocolFilterValue(token)
    if (protocolNumber !== undefined) {
      filter.protocols.add(protocolNumber)
      filter.recognizedTokens += 1
      continue
    }

    if ((token === 'ip' || token === 'ip6') && next === 'proto' && afterNext) {
      const value = parseProtocolFilterValue(afterNext)
      if (value === undefined) {
        throw new Error(`Invalid filter syntax: "${token} ${next} ${afterNext}" is not a valid protocol expression.`)
      }
      filter.protocols.add(value)
      filter.recognizedTokens += 3
      index += 2
      continue
    }

    if (token === 'proto' && next) {
      const value = parseProtocolFilterValue(next)
      if (value === undefined) {
        throw new Error(`Invalid filter syntax: "${token} ${next}" is not a valid protocol expression.`)
      }
      filter.protocols.add(value)
      filter.recognizedTokens += 2
      index += 1
      continue
    }

    if (token === 'host' && next) {
      filter.host = next
      filter.recognizedTokens += 2
      index += 1
      continue
    }

    if ((token === 'src' || token === 'dst') && next === 'host' && afterNext) {
      if (token === 'src') filter.srcHost = afterNext
      else filter.dstHost = afterNext
      filter.recognizedTokens += 3
      index += 2
      continue
    }

    if (token === 'port' && next) {
      filter.port = Number(next)
      if (!Number.isFinite(filter.port)) {
        throw new Error(`Invalid filter syntax: "${token} ${next}" is not a valid port expression.`)
      }
      filter.recognizedTokens += 2
      index += 1
      continue
    }

    if ((token === 'src' || token === 'dst') && next === 'port' && afterNext) {
      if (token === 'src') filter.srcPort = Number(afterNext)
      else filter.dstPort = Number(afterNext)
      if (!Number.isFinite(token === 'src' ? filter.srcPort : filter.dstPort)) {
        throw new Error(`Invalid filter syntax: "${token} ${next} ${afterNext}" is not a valid port expression.`)
      }
      filter.recognizedTokens += 3
      index += 2
      continue
    }

    throw new Error(`Invalid filter syntax near "${token}". Use forms like "icmp", "tcp port 80", "host 10.150.0.71", "src host 10.150.0.71", or "dst host 10.151.0.71".`)
  }

  if (filter.hasExpression && filter.recognizedTokens !== tokens.length) {
    throw new Error('Invalid filter syntax. Some filter tokens were not recognized.')
  }

  return filter
}

function matchesOfflinePacketFilter(packet: EmulatorTopologyPcapPacket, filter: OfflinePacketFilter) {
  if (filter.protocols.size && !matchesPacketProtocol(packet, filter.protocols)) {
    return false
  }

  if (filter.host && packet.sourceIp !== filter.host && packet.destIp !== filter.host) {
    return false
  }
  if (filter.srcHost && packet.sourceIp !== filter.srcHost) {
    return false
  }
  if (filter.dstHost && packet.destIp !== filter.dstHost) {
    return false
  }
  if (filter.port !== undefined && Number.isFinite(filter.port) && packet.sourcePort !== filter.port && packet.destPort !== filter.port) {
    return false
  }
  if (filter.srcPort !== undefined && Number.isFinite(filter.srcPort) && packet.sourcePort !== filter.srcPort) {
    return false
  }
  if (filter.dstPort !== undefined && Number.isFinite(filter.dstPort) && packet.destPort !== filter.dstPort) {
    return false
  }

  return true
}

function matchesPacketProtocol(packet: EmulatorTopologyPcapPacket, protocols: Set<number>) {
  const protocolNumber = packet.ipProtocolNumber ?? parseProtocolFilterValue(packet.ipProtocol)
  return protocolNumber !== undefined && protocols.has(protocolNumber)
}

function parseProtocolFilterValue(value: string | undefined) {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  if (normalized in PROTOCOL_BY_NAME) return PROTOCOL_BY_NAME[normalized]
  const numeric = Number(normalized)
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 255) return numeric
  const ipDashMatch = normalized.match(/^ip-(\d{1,3})$/)
  if (!ipDashMatch) return undefined
  const ipDashProtocol = Number(ipDashMatch[1])
  return Number.isInteger(ipDashProtocol) && ipDashProtocol >= 0 && ipDashProtocol <= 255
    ? ipDashProtocol
    : undefined
}

function normalizeJSONPacket(value: unknown): EmulatorTopologyPacketReplayEvent | undefined {
  if (!isRecord(value)) return undefined

  const timestampMs = getTimestampMs(value)
  if (!Number.isFinite(timestampMs)) return undefined

  return {
    timestampMs,
    timestampNs: timestampNsValue(value.timestampNs),
    containerId: stringValue(value.containerId) ?? '',
    containerName: stringValue(value.containerName) ?? stringValue(value.containerId),
    ifName: stringValue(value.ifName) ?? stringValue(value.captureIfName) ?? stringValue(value.hostIfName),
    nodeLabel: stringValue(value.nodeLabel) ?? stringValue(value.nameLabel) ?? stringValue(value.label),
    nodeName: stringValue(value.nodeName) ?? stringValue(value.nodeId),
    nodeIp: stringValue(value.nodeIp) ?? stringValue(value.containerIpv4),
    networkId: stringValue(value.networkId),
    networkName: stringValue(value.networkName),
    networkLabel: stringValue(value.networkLabel),
    sourceIp: stringValue(value.sourceIp),
    destIp: stringValue(value.destIp),
    ipProtocol: stringValue(value.ipProtocol),
    ipProtocolNumber: numberValue(value.ipProtocolNumber),
    flowId: stringValue(value.flowId),
    packetId: stringValue(value.packetId),
    packetRole: stringValue(value.packetRole),
    packetKind: stringValue(value.packetKind),
    sourcePort: numberValue(value.sourcePort),
    destPort: numberValue(value.destPort),
    icmpType: numberValue(value.icmpType),
    icmpCode: numberValue(value.icmpCode),
    icmpId: numberValue(value.icmpId),
    icmpSeq: numberValue(value.icmpSeq),
    tcpSeq: numberValue(value.tcpSeq),
    tcpAck: numberValue(value.tcpAck),
    tcpFlags: stringValue(value.tcpFlags),
    sourceContainerId: stringValue(value.sourceContainerId),
    sourceContainerName: stringValue(value.sourceContainerName) ?? stringValue(value.sourceContainerId),
    sourceNodeName: stringValue(value.sourceNodeName),
    sourceNodeIp: stringValue(value.sourceNodeIp),
    destContainerId: stringValue(value.destContainerId),
    destContainerName: stringValue(value.destContainerName) ?? stringValue(value.destContainerId),
    destNodeName: stringValue(value.destNodeName),
    destNodeIp: stringValue(value.destNodeIp),
  }
}

export function remapEmulatorTopologyPacketReplayEvent(
  event: EmulatorTopologyPacketReplayEvent,
  containers: EmulatorNode[],
  networks: EmulatorNetwork[] = [],
): EmulatorTopologyPacketReplayEvent {
  const container =
    findContainerByContainerName(event.containerName, containers) ??
    findContainerByIP(event.nodeIp, containers) ??
    findContainerByLabel(event.nodeLabel, containers) ??
    findContainerByNode(event.nodeName, event.nodeIp, event.nodeLabel, event.containerName || event.containerId, containers) ??
    findContainerByEndpoint(event, containers) ??
    findContainerById(event.containerId, containers) ??
    findContainerByIP(event.destIp, containers) ??
    findContainerByIP(event.sourceIp, containers)
  const info = container?.meta?.emulatorInfo
  const network = findNetworkForEvent(event, networks)
  const sourceContainer = findContainerByNode(
    event.sourceNodeName,
    event.sourceNodeIp || event.sourceIp,
    undefined,
    event.sourceContainerName || event.sourceContainerId,
    containers,
  )
  const destContainer = findContainerByNode(
    event.destNodeName,
    event.destNodeIp || event.destIp,
    undefined,
    event.destContainerName || event.destContainerId,
    containers,
  )

  return {
    ...event,
    containerId: container?.Id ?? event.containerId,
    containerName: getContainerName(container) ?? event.containerName,
    ifName: event.ifName,
    nodeLabel: getContainerNodeLabel(container) ?? event.nodeLabel,
    nodeName: info?.displayname || info?.name || event.nodeName,
    nodeIp: findBestContainerIP(container, event.nodeIp || event.destIp || event.sourceIp) ?? event.nodeIp,
    networkId: network?.Id ?? event.networkId,
    networkName: network?.Name ?? event.networkName,
    networkLabel: getNetworkLabel(network) ?? event.networkLabel,
    sourceContainerId: sourceContainer?.Id ?? event.sourceContainerId,
    sourceContainerName: getContainerName(sourceContainer) ?? event.sourceContainerName,
    sourceNodeName: sourceContainer?.meta?.emulatorInfo?.displayname || sourceContainer?.meta?.emulatorInfo?.name || event.sourceNodeName,
    sourceNodeIp: findBestContainerIP(sourceContainer, event.sourceNodeIp || event.sourceIp) ?? event.sourceNodeIp,
    destContainerId: destContainer?.Id ?? event.destContainerId,
    destContainerName: getContainerName(destContainer) ?? event.destContainerName,
    destNodeName: destContainer?.meta?.emulatorInfo?.displayname || destContainer?.meta?.emulatorInfo?.name || event.destNodeName,
    destNodeIp: findBestContainerIP(destContainer, event.destNodeIp || event.destIp) ?? event.destNodeIp,
  }
}

function getContainerNodeLabel(container: EmulatorNode | undefined) {
  const info = container?.meta?.emulatorInfo
  if (!info) return undefined
  if (info.displayname) return info.displayname
  if (info.asn !== undefined && info.name) return `${info.asn}/${info.name}`
  return info.name
}

function getNetworkLabel(network: EmulatorNetwork | undefined) {
  const info = network?.meta?.emulatorInfo
  if (!info) return undefined
  if (info.displayname) return info.displayname
  if (info.scope !== undefined && info.name) return `${info.scope}/${info.name}`
  return info.name ?? network?.Name ?? network?.Id.slice(0, 12)
}

export function sortPacketReplayEvents(events: EmulatorTopologyPacketReplayEvent[]) {
  return [...events].sort((left, right) => {
    const leftNs = bigintValue(left.timestampNs)
    const rightNs = bigintValue(right.timestampNs)
    if (leftNs !== undefined && rightNs !== undefined && leftNs !== rightNs) {
      return leftNs < rightNs ? -1 : 1
    }
    return left.timestampMs - right.timestampMs
  })
}

function getTimestampMs(value: Record<string, unknown>) {
  const timestampNs = bigintValue(value.timestampNs)
  if (timestampNs !== undefined) {
    return Number(timestampNs / 1_000_000n)
  }
  const numericTimestamp = numberValue(value.timestampMs) ?? numberValue(value.timestamp)
  if (numericTimestamp !== undefined) {
    return numericTimestamp > 10_000_000_000 ? numericTimestamp : numericTimestamp * 1000
  }
  const textTimestamp = stringValue(value.timestamp)
  return textTimestamp ? Date.parse(textTimestamp) : Number.NaN
}

function parseEthernetIPv4Packet(
  view: DataView,
  offset: number,
  includedLength: number,
): Pick<EmulatorTopologyPacketReplayEvent, 'sourceIp' | 'destIp' | 'ipProtocol' | 'ipProtocolNumber' | 'sourcePort' | 'destPort'> | undefined {
  if (includedLength < 34) return undefined
  const ethertype = view.getUint16(offset + 12, false)
  if (ethertype !== ETHERTYPE_IPV4) return undefined

  const ipOffset = offset + 14
  const versionAndIhl = view.getUint8(ipOffset)
  const version = versionAndIhl >> 4
  const headerLength = (versionAndIhl & 0x0f) * 4
  if (version !== 4 || headerLength < 20 || includedLength < 14 + headerLength) return undefined

  const protocol = view.getUint8(ipOffset + 9)
  const packet = {
    sourceIp: readIPv4(view, ipOffset + 12),
    destIp: readIPv4(view, ipOffset + 16),
    ipProtocol: protocolName(protocol),
    ipProtocolNumber: protocol,
  }

  if ((protocol === PROTO_TCP || protocol === PROTO_UDP) && includedLength >= 14 + headerLength + 4) {
    const transportOffset = ipOffset + headerLength
    return {
      ...packet,
      sourcePort: view.getUint16(transportOffset, false),
      destPort: view.getUint16(transportOffset + 2, false),
    }
  }

  return packet
}

function findContainerById(containerId: string | undefined, containers: EmulatorNode[]) {
  if (!containerId) return undefined
  return containers.find((container) =>
    container.Id === containerId ||
    container.Id.startsWith(containerId) ||
    containerId.startsWith(container.Id),
  )
}

function getContainerName(container: EmulatorNode | undefined) {
  return container?.Names?.[0]?.replace(/^\//, '')
}

function findContainerByContainerName(containerName: string | undefined, containers: EmulatorNode[]) {
  const normalizedName = normalizeText(containerName)
  if (!normalizedName) return undefined

  return containers.find((container) =>
    normalizeText(getContainerName(container)) === normalizedName ||
    (container.Names ?? []).some((name) => normalizeText(name) === normalizedName),
  )
}

function findContainerByNode(
  nodeName: string | undefined,
  nodeIp: string | undefined,
  nodeLabel: string | undefined,
  containerHint: string | undefined,
  containers: EmulatorNode[],
) {
  return findContainerByIP(nodeIp, containers) ??
    findContainerByLabel(nodeLabel, containers) ??
    findContainerByContainerName(containerHint, containers) ??
    findContainerById(containerHint, containers) ??
    findContainerByName(nodeName, containers)
}

function findContainerByEndpoint(event: EmulatorTopologyPacketReplayEvent, containers: EmulatorNode[]) {
  const nodeIp = normalizeIPAddress(event.nodeIp)
  if (!nodeIp) return undefined

  const sourceIp = normalizeIPAddress(event.sourceIp)
  const destIp = normalizeIPAddress(event.destIp)
  if (nodeIp === sourceIp) {
    return findContainerByNode(event.sourceNodeName, event.sourceNodeIp || event.sourceIp, undefined, event.sourceContainerId, containers)
  }
  if (nodeIp === destIp) {
    return findContainerByNode(event.destNodeName, event.destNodeIp || event.destIp, undefined, event.destContainerId, containers)
  }

  return undefined
}

function findContainerByLabel(nodeLabel: string | undefined, containers: EmulatorNode[]) {
  const parsed = parseNodeLabel(nodeLabel)
  if (!parsed) return undefined

  return containers.find((container) => {
    const info = container.meta?.emulatorInfo
    return String(info?.asn ?? '') === parsed.asn && normalizeText(info?.name) === parsed.name
  })
}

function findContainerByName(nodeName: string | undefined, containers: EmulatorNode[]) {
  const normalizedName = normalizeText(nodeName)
  if (!normalizedName) return undefined

  return containers.find((container) => {
    const info = container.meta?.emulatorInfo
    return [
      info?.name,
      info?.displayname,
      ...(container.Names ?? []),
    ].some((value) => {
      const candidate = normalizeText(value)
      return Boolean(candidate) && (candidate.includes(normalizedName) || normalizedName.includes(candidate))
    })
  })
}

function parseNodeLabel(value: string | undefined) {
  const normalized = value?.trim()
  if (!normalized) return undefined

  const match = normalized.match(/^(\d+)\/(.+)$/)
  if (!match) return undefined

  return {
    asn: match[1],
    name: normalizeText(match[2]),
  }
}

function findContainerByIP(ip: string | undefined, containers: EmulatorNode[]) {
  const normalizedIp = normalizeIPAddress(ip)
  if (!normalizedIp) return undefined

  return containers.find((container) =>
    container.meta?.emulatorInfo?.nets?.some((net) => normalizeIPAddress(net.address) === normalizedIp) ||
    Object.values(container.NetworkSettings?.Networks ?? {}).some((network) => normalizeIPAddress(network.IPAddress) === normalizedIp),
  )
}

function findNetworkForEvent(event: EmulatorTopologyPacketReplayEvent, networks: EmulatorNetwork[]) {
  if (!networks.length) return undefined

  return findNetworkById(event.networkId, networks) ??
    findNetworkByLabel(event.networkLabel, networks) ??
    findNetworkByName(event.networkName, networks) ??
    findNetworkByLabel(deriveNetworkLabelFromName(event.networkName), networks)
}

function findNetworkById(networkId: string | undefined, networks: EmulatorNetwork[]) {
  if (!networkId) return undefined
  return networks.find((network) =>
    network.Id === networkId ||
    network.Id.startsWith(networkId) ||
    networkId.startsWith(network.Id),
  )
}

function findNetworkByLabel(networkLabel: string | undefined, networks: EmulatorNetwork[]) {
  const normalizedLabel = normalizeNetworkLabel(networkLabel)
  if (!normalizedLabel) return undefined

  return networks.find((network) => normalizeNetworkLabel(getNetworkLabel(network)) === normalizedLabel)
}

function findNetworkByName(networkName: string | undefined, networks: EmulatorNetwork[]) {
  const normalizedName = normalizeText(networkName)
  if (!normalizedName) return undefined

  return networks.find((network) => {
    const candidateName = normalizeText(network.Name)
    const emulatorName = normalizeText(network.meta?.emulatorInfo?.name)
    return Boolean(
      candidateName && (candidateName === normalizedName || candidateName.endsWith(`_${normalizedName}`)) ||
      emulatorName && (emulatorName === normalizedName || normalizedName.endsWith(`_${emulatorName}`)),
    )
  })
}

function deriveNetworkLabelFromName(networkName: string | undefined) {
  const normalizedName = normalizeText(networkName)
  if (!normalizedName) return undefined

  const ixMatch = normalizedName.match(/(?:^|_)net_ix_(.+)$/)
  if (ixMatch?.[1]) return `ix/${ixMatch[1]}`

  const localMatch = normalizedName.match(/(?:^|_)net_(\d+)_(.+)$/)
  if (localMatch?.[1] && localMatch[2]) return `${localMatch[1]}/${localMatch[2]}`

  return undefined
}

function normalizeNetworkLabel(value: string | undefined) {
  return value?.trim().replace(/^as/i, '').toLowerCase() || undefined
}

function findBestContainerIP(container: EmulatorNode | undefined, preferredIp: string | undefined) {
  const preferred = normalizeIPAddress(preferredIp)
  const emulatorNets = container?.meta?.emulatorInfo?.nets ?? []
  const dockerIps = Object.values(container?.NetworkSettings?.Networks ?? {}).map((network) => network.IPAddress)

  if (preferred && (emulatorNets.some((net) => normalizeIPAddress(net.address) === preferred) || dockerIps.some((ip) => normalizeIPAddress(ip) === preferred))) {
    return preferred
  }

  return normalizeIPAddress(emulatorNets.find((net) => normalizeIPAddress(net.address))?.address) ?? normalizeIPAddress(dockerIps.find(Boolean))
}

function looksLikePcap(buffer: ArrayBuffer) {
  if (buffer.byteLength < 4) return false
  const view = new DataView(buffer)
  return view.getUint32(0, true) === PCAP_MAGIC_LE || view.getUint32(0, false) === PCAP_MAGIC_BE
}

function readIPv4(view: DataView, offset: number) {
  return [
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  ].join('.')
}

function protocolName(protocol: number) {
  const entry = Object.entries(PROTOCOL_BY_NAME).find(([, value]) => value === protocol)
  if (entry) return entry[0]
  return `ip-${protocol}`
}

function normalizeIPAddress(value: string | undefined) {
  return value?.trim().split('/')[0] || undefined
}

function normalizeText(value: string | undefined) {
  return value?.replace(/^\//, '').trim().toLowerCase() ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function timestampNsValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}

function bigintValue(value: unknown) {
  try {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
    if (typeof value === 'string' && value.trim()) return BigInt(value.trim())
  } catch {
    return undefined
  }
  return undefined
}
