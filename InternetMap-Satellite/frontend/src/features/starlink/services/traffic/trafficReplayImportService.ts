import {
  createTrafficReplayEvent,
  compareTrafficReplayEvents,
} from '@/features/starlink/services/traffic/trafficReplayService';
import type {
  EmulatorContainerInfo,
} from '@/features/starlink/services/emulatorContainerService';
import type {
  TrafficPacketMessage,
  TrafficPacketReplayEvent,
} from '@/features/starlink/types';

const PCAP_MAGIC_LE = 0xa1b2c3d4;
const PCAP_MAGIC_BE = 0xd4c3b2a1;
const PCAP_GLOBAL_HEADER_LENGTH = 24;
const PCAP_PACKET_HEADER_LENGTH = 16;
const ETHERTYPE_IPV4 = 0x0800;
const PROTO_ICMP = 1;
const PROTO_IGMP = 2;
const PROTO_TCP = 6;
const PROTO_UDP = 17;
const PROTO_GRE = 47;
const PROTO_ICMPV6 = 58;

const PROTOCOL_BY_NAME: Record<string, number> = {
  gre: PROTO_GRE,
  icmp: PROTO_ICMP,
  icmp6: PROTO_ICMPV6,
  icmpv6: PROTO_ICMPV6,
  igmp: PROTO_IGMP,
  tcp: PROTO_TCP,
  udp: PROTO_UDP,
};

export type TrafficReplayImportResult = {
  events: TrafficPacketReplayEvent[];
  fileType: 'json' | 'pcap';
  remappedCount: number;
  skippedCount: number;
};

export type TrafficReplayImportOptions = {
  sort?: boolean;
};

export type TrafficReplayPcapPacket = {
  index: number;
  timestampMs: number;
  timestampNs: string;
  sourceIp?: string;
  destIp?: string;
  ipProtocol?: string;
  ipProtocolNumber?: number;
  sourcePort?: number;
  destPort?: number;
};

export type TrafficReplayPcapParseResult = {
  packets: TrafficReplayPcapPacket[];
  skippedCount: number;
};

export type TrafficReplayOfflineFilterResult = {
  events: TrafficPacketReplayEvent[];
  matchedPacketCount: number;
  skippedPacketCount: number;
};

export async function importTrafficReplayFile(
  file: File,
  containers: EmulatorContainerInfo[],
  options: TrafficReplayImportOptions = {},
): Promise<TrafficReplayImportResult> {
  if (file.name.toLowerCase().endsWith('.json')) {
    return importTrafficReplayJSON(file, containers, options);
  }

  if (file.name.toLowerCase().endsWith('.pcap')) {
    return importTrafficReplayPCAP(file, containers, options);
  }

  const buffer = await file.arrayBuffer();
  if (looksLikePcap(buffer)) {
    return parseTrafficReplayPCAP(buffer, containers, options);
  }

  return parseTrafficReplayJSON(new TextDecoder().decode(buffer), containers, options);
}

async function importTrafficReplayJSON(
  file: File,
  containers: EmulatorContainerInfo[],
  options: TrafficReplayImportOptions = {},
): Promise<TrafficReplayImportResult> {
  return parseTrafficReplayJSON(await file.text(), containers, options);
}

function parseTrafficReplayJSON(
  text: string,
  containers: EmulatorContainerInfo[],
  options: TrafficReplayImportOptions = {},
): TrafficReplayImportResult {
  const parsed = JSON.parse(text) as unknown;
  const rawMessages = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.events)
      ? parsed.events
      : isRecord(parsed) && Array.isArray(parsed.packets)
        ? parsed.packets
        : [];

  let remappedCount = 0;
  let skippedCount = 0;
  const messages = rawMessages.flatMap((value): TrafficPacketMessage[] => {
    const message = normalizeJSONPacketMessage(value);
    if (!message) {
      skippedCount += 1;
      return [];
    }

    const remapped = remapTrafficPacketMessage(message, containers);
    if (!remapped.containerName && !remapped.containerId) {
      skippedCount += 1;
      return [];
    }
    if (remapped.containerName !== message.containerName || remapped.containerId !== message.containerId) {
      remappedCount += 1;
    }

    return [remapped as TrafficPacketMessage];
  });

  return {
    events: options.sort === false
      ? messages.map(createTrafficReplayEvent)
      : messages.map(createTrafficReplayEvent).sort(compareTrafficReplayEvents),
    fileType: 'json',
    remappedCount,
    skippedCount,
  };
}

async function importTrafficReplayPCAP(
  file: File,
  containers: EmulatorContainerInfo[],
  options: TrafficReplayImportOptions = {},
): Promise<TrafficReplayImportResult> {
  return parseTrafficReplayPCAP(await file.arrayBuffer(), containers, options);
}

function parseTrafficReplayPCAP(
  buffer: ArrayBuffer,
  containers: EmulatorContainerInfo[],
  options: TrafficReplayImportOptions = {},
): TrafficReplayImportResult {
  const result = parseTrafficReplayPcapPackets(buffer);
  const messages: TrafficPacketMessage[] = [];
  let skippedCount = result.skippedCount;
  result.packets.forEach((packet) => {
    const message = remapTrafficPacketMessage({
      type: 'packet',
      timestamp: new Date(packet.timestampMs).toISOString(),
      timestampNs: packet.timestampNs,
      containerName: '',
      direction: 'ingress',
      sourceIp: packet.sourceIp,
      destIp: packet.destIp,
      ipProtocol: packet.ipProtocol,
      ipProtocolNumber: packet.ipProtocolNumber,
      sourcePort: packet.sourcePort,
      destPort: packet.destPort,
    }, containers);

    if (!message.containerName && !message.containerId) {
      skippedCount += 1;
      return;
    }

    messages.push(message as TrafficPacketMessage);
  });

  return {
    events: options.sort === false
      ? messages.map(createTrafficReplayEvent)
      : messages.map(createTrafficReplayEvent).sort(compareTrafficReplayEvents),
    fileType: 'pcap',
    remappedCount: messages.length,
    skippedCount,
  };
}

export async function parseTrafficReplayPcapFile(file: File): Promise<TrafficReplayPcapParseResult> {
  return parseTrafficReplayPcapPackets(await file.arrayBuffer());
}

export function parseTrafficReplayPcapPackets(buffer: ArrayBuffer): TrafficReplayPcapParseResult {
  const view = new DataView(buffer);
  if (view.byteLength < PCAP_GLOBAL_HEADER_LENGTH) {
    throw new Error('Invalid pcap file: global header is missing.');
  }

  const magic = view.getUint32(0, true);
  const littleEndian = magic === PCAP_MAGIC_LE
    ? true
    : view.getUint32(0, false) === PCAP_MAGIC_BE
      ? false
      : undefined;
  if (littleEndian === undefined) {
    throw new Error('Invalid pcap file: unsupported magic number.');
  }

  const packets: TrafficReplayPcapPacket[] = [];
  let offset = PCAP_GLOBAL_HEADER_LENGTH;
  let skippedCount = 0;
  let packetIndex = 0;

  while (offset + PCAP_PACKET_HEADER_LENGTH <= view.byteLength) {
    const seconds = view.getUint32(offset, littleEndian);
    const micros = view.getUint32(offset + 4, littleEndian);
    const includedLength = view.getUint32(offset + 8, littleEndian);
    offset += PCAP_PACKET_HEADER_LENGTH;

    if (includedLength <= 0 || offset + includedLength > view.byteLength) {
      skippedCount += 1;
      break;
    }

    const packet = parseEthernetIPv4Packet(view, offset, includedLength);
    offset += includedLength;

    if (!packet) {
      skippedCount += 1;
      packetIndex += 1;
      continue;
    }

    const timestampMs = seconds * 1000 + Math.floor(micros / 1000);
    packets.push({
      index: packetIndex,
      timestampMs,
      timestampNs: String(BigInt(seconds) * 1_000_000_000n + BigInt(micros) * 1_000n),
      ...packet,
    });
    packetIndex += 1;
  }

  return { packets, skippedCount };
}

export function filterTrafficReplayEventsByPcap(
  eventsByOriginalIndex: TrafficPacketReplayEvent[],
  pcapPackets: TrafficReplayPcapPacket[],
  filterExpression: string,
): TrafficReplayOfflineFilterResult {
  const filter = parseOfflinePacketFilter(filterExpression);
  const matchedPackets = pcapPackets.filter((packet) => matchesOfflinePacketFilter(packet, filter));
  const events = matchedPackets
    .map((packet) => eventsByOriginalIndex[packet.index])
    .filter((event): event is TrafficPacketReplayEvent => Boolean(event));

  return {
    events: events.sort(compareTrafficReplayEvents),
    matchedPacketCount: matchedPackets.length,
    skippedPacketCount: matchedPackets.length - events.length,
  };
}

type OfflinePacketFilter = {
  protocols: Set<number>;
  hasExpression: boolean;
  recognizedTokens: number;
  host?: string;
  srcHost?: string;
  dstHost?: string;
  port?: number;
  srcPort?: number;
  dstPort?: number;
};

function parseOfflinePacketFilter(expression: string): OfflinePacketFilter {
  const filter: OfflinePacketFilter = {
    protocols: new Set(),
    hasExpression: Boolean(expression.trim()),
    recognizedTokens: 0,
  };
  const tokens = expression
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const afterNext = tokens[index + 2];

    const protocolNumber = parseProtocolFilterValue(token);
    if (protocolNumber !== undefined) {
      filter.protocols.add(protocolNumber);
      filter.recognizedTokens += 1;
      continue;
    }

    if ((token === 'ip' || token === 'ip6') && next === 'proto' && afterNext) {
      const value = parseProtocolFilterValue(afterNext);
      if (value === undefined) {
        throw new Error(`Invalid filter syntax: "${token} ${next} ${afterNext}" is not a valid protocol expression.`);
      }
      filter.protocols.add(value);
      filter.recognizedTokens += 3;
      index += 2;
      continue;
    }

    if (token === 'proto' && next) {
      const value = parseProtocolFilterValue(next);
      if (value === undefined) {
        throw new Error(`Invalid filter syntax: "${token} ${next}" is not a valid protocol expression.`);
      }
      filter.protocols.add(value);
      filter.recognizedTokens += 2;
      index += 1;
      continue;
    }

    if (token === 'host' && next) {
      filter.host = next;
      filter.recognizedTokens += 2;
      index += 1;
      continue;
    }

    if ((token === 'src' || token === 'dst') && next === 'host' && afterNext) {
      if (token === 'src') filter.srcHost = afterNext;
      else filter.dstHost = afterNext;
      filter.recognizedTokens += 3;
      index += 2;
      continue;
    }

    if (token === 'port' && next) {
      filter.port = Number(next);
      if (!Number.isFinite(filter.port)) {
        throw new Error(`Invalid filter syntax: "${token} ${next}" is not a valid port expression.`);
      }
      filter.recognizedTokens += 2;
      index += 1;
      continue;
    }

    if ((token === 'src' || token === 'dst') && next === 'port' && afterNext) {
      if (token === 'src') filter.srcPort = Number(afterNext);
      else filter.dstPort = Number(afterNext);
      if (!Number.isFinite(token === 'src' ? filter.srcPort : filter.dstPort)) {
        throw new Error(`Invalid filter syntax: "${token} ${next} ${afterNext}" is not a valid port expression.`);
      }
      filter.recognizedTokens += 3;
      index += 2;
      continue;
    }

    throw new Error(`Invalid filter syntax near "${token}". Use forms like "icmp", "tcp port 80", "host 10.150.0.71", "src host 10.150.0.71", or "dst host 10.151.0.71".`);
  }

  if (filter.hasExpression && filter.recognizedTokens !== tokens.length) {
    throw new Error('Invalid filter syntax. Some filter tokens were not recognized.');
  }

  return filter;
}

function matchesOfflinePacketFilter(packet: TrafficReplayPcapPacket, filter: OfflinePacketFilter) {
  if (filter.protocols.size && !matchesPacketProtocol(packet, filter.protocols)) {
    return false;
  }

  if (filter.host && packet.sourceIp !== filter.host && packet.destIp !== filter.host) {
    return false;
  }
  if (filter.srcHost && packet.sourceIp !== filter.srcHost) {
    return false;
  }
  if (filter.dstHost && packet.destIp !== filter.dstHost) {
    return false;
  }
  if (filter.port !== undefined && Number.isFinite(filter.port) && packet.sourcePort !== filter.port && packet.destPort !== filter.port) {
    return false;
  }
  if (filter.srcPort !== undefined && Number.isFinite(filter.srcPort) && packet.sourcePort !== filter.srcPort) {
    return false;
  }
  if (filter.dstPort !== undefined && Number.isFinite(filter.dstPort) && packet.destPort !== filter.dstPort) {
    return false;
  }

  return true;
}

function matchesPacketProtocol(packet: TrafficReplayPcapPacket, protocols: Set<number>) {
  const protocolNumber = packet.ipProtocolNumber ?? parseProtocolFilterValue(packet.ipProtocol);
  return protocolNumber !== undefined && protocols.has(protocolNumber);
}

function parseProtocolFilterValue(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized in PROTOCOL_BY_NAME) return PROTOCOL_BY_NAME[normalized];
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 255) return numeric;
  const ipDashMatch = normalized.match(/^ip-(\d{1,3})$/);
  if (!ipDashMatch) return undefined;
  const ipDashProtocol = Number(ipDashMatch[1]);
  return Number.isInteger(ipDashProtocol) && ipDashProtocol >= 0 && ipDashProtocol <= 255
    ? ipDashProtocol
    : undefined;
}

function normalizeJSONPacketMessage(value: unknown): TrafficPacketMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const timestamp = stringValue(value.timestamp) ?? new Date().toISOString();
  return {
    type: 'packet',
    timestamp,
    timestampNs: value.timestampNs as TrafficPacketMessage['timestampNs'],
    containerName: stringValue(value.containerName) ?? stringValue(value.containerId) ?? '',
    containerId: stringValue(value.containerId),
    ifName:
      stringValue(value.ifName) ??
      stringValue(value.captureIfName) ??
      stringValue(value.hostIfName),
    nodeLabel:
      stringValue(value.nodeLabel) ??
      stringValue(value.nameLabel) ??
      stringValue(value.label),
    direction: value.direction === 'egress' ? 'egress' : 'ingress',
    nodeName: stringValue(value.nodeName) ?? stringValue(value.nodeId),
    nodeIp: stringValue(value.nodeIp) ?? stringValue(value.containerIpv4),
    networkId: stringValue(value.networkId),
    networkName: stringValue(value.networkName),
    networkLabel: stringValue(value.networkLabel),
    sourceIp: stringValue(value.sourceIp),
    destIp: stringValue(value.destIp),
    ipProtocol: stringValue(value.ipProtocol),
    ipProtocolNumber: numberValue(value.ipProtocolNumber),
    sourcePort: numberValue(value.sourcePort),
    destPort: numberValue(value.destPort),
    sourceContainerName: stringValue(value.sourceContainerName) ?? stringValue(value.sourceContainerId),
    sourceContainerId: stringValue(value.sourceContainerId),
    sourceNodeName: stringValue(value.sourceNodeName),
    sourceNodeIp: stringValue(value.sourceNodeIp),
    destContainerName: stringValue(value.destContainerName) ?? stringValue(value.destContainerId),
    destContainerId: stringValue(value.destContainerId),
    destNodeName: stringValue(value.destNodeName),
    destNodeIp: stringValue(value.destNodeIp),
  };
}

function remapTrafficPacketMessage(
  message: TrafficPacketMessage,
  containers: EmulatorContainerInfo[],
): TrafficPacketMessage {
  const currentContainer =
    findContainerByContainerName(message.containerName, containers) ??
    findContainerById(message.containerId, containers) ??
    findContainerByNode(message.nodeName, message.nodeIp, message.containerName || message.containerId, containers) ??
    findContainerByNode(message.destNodeName, message.destNodeIp, message.destContainerName || message.destContainerId, containers) ??
    findContainerByNode(message.sourceNodeName, message.sourceNodeIp, message.sourceContainerName || message.sourceContainerId, containers) ??
    findContainerByIP(message.destIp, containers) ??
    findContainerByIP(message.sourceIp, containers);

  const emulatorInfo = currentContainer?.meta?.emulatorInfo;
  return {
    ...message,
    containerName: getContainerName(currentContainer) ?? message.containerName,
    containerId: currentContainer?.Id ?? message.containerId,
    nodeLabel: message.nodeLabel || getContainerNodeLabel(currentContainer),
    nodeName: emulatorInfo?.displayname || emulatorInfo?.name || message.nodeName,
    nodeIp: findBestContainerIP(currentContainer, message.nodeIp || message.destIp || message.sourceIp) ?? message.nodeIp,
    sourceContainerId: findContainerByNode(
      message.sourceNodeName,
      message.sourceNodeIp || message.sourceIp,
      message.sourceContainerName || message.sourceContainerId,
      containers,
    )?.Id ?? message.sourceContainerId,
    sourceContainerName: getContainerName(findContainerByNode(
      message.sourceNodeName,
      message.sourceNodeIp || message.sourceIp,
      message.sourceContainerName || message.sourceContainerId,
      containers,
    )) ?? message.sourceContainerName,
    destContainerId: findContainerByNode(
      message.destNodeName,
      message.destNodeIp || message.destIp,
      message.destContainerName || message.destContainerId,
      containers,
    )?.Id ?? message.destContainerId,
    destContainerName: getContainerName(findContainerByNode(
      message.destNodeName,
      message.destNodeIp || message.destIp,
      message.destContainerName || message.destContainerId,
      containers,
    )) ?? message.destContainerName,
  };
}

function getContainerNodeLabel(container: EmulatorContainerInfo | undefined) {
  const emulatorInfo = container?.meta?.emulatorInfo;
  if (!emulatorInfo) {
    return undefined;
  }
  if (emulatorInfo.displayname) {
    return emulatorInfo.displayname;
  }
  if (emulatorInfo.asn !== undefined && emulatorInfo.name) {
    return `${emulatorInfo.asn}/${emulatorInfo.name}`;
  }
  return emulatorInfo.name;
}

function parseEthernetIPv4Packet(
  view: DataView,
  offset: number,
  includedLength: number,
): Pick<TrafficReplayPcapPacket, 'sourceIp' | 'destIp' | 'ipProtocol' | 'ipProtocolNumber' | 'sourcePort' | 'destPort'> | undefined {
  if (includedLength < 34) {
    return undefined;
  }

  const ethertype = view.getUint16(offset + 12, false);
  if (ethertype !== ETHERTYPE_IPV4) {
    return undefined;
  }

  const ipOffset = offset + 14;
  const versionAndIhl = view.getUint8(ipOffset);
  const version = versionAndIhl >> 4;
  const headerLength = (versionAndIhl & 0x0f) * 4;
  if (version !== 4 || headerLength < 20 || includedLength < 14 + headerLength) {
    return undefined;
  }

  const protocol = view.getUint8(ipOffset + 9);
  const sourceIp = readIPv4(view, ipOffset + 12);
  const destIp = readIPv4(view, ipOffset + 16);
  const transportOffset = ipOffset + headerLength;
  const message: Partial<TrafficPacketMessage> = {
    sourceIp,
    destIp,
    ipProtocol: protocolName(protocol),
    ipProtocolNumber: protocol,
  };

  if ((protocol === PROTO_TCP || protocol === PROTO_UDP) && transportOffset + 4 <= offset + includedLength) {
    message.sourcePort = view.getUint16(transportOffset, false);
    message.destPort = view.getUint16(transportOffset + 2, false);
  }

  return message;
}

function looksLikePcap(buffer: ArrayBuffer) {
  if (buffer.byteLength < 4) {
    return false;
  }

  const view = new DataView(buffer);
  return view.getUint32(0, true) === PCAP_MAGIC_LE || view.getUint32(0, false) === PCAP_MAGIC_BE;
}

function findContainerById(containerId: string | undefined, containers: EmulatorContainerInfo[]) {
  if (!containerId) {
    return undefined;
  }

  return containers.find((container) =>
    container.Id === containerId ||
    container.Id.startsWith(containerId) ||
    containerId.startsWith(container.Id),
  );
}

function getContainerName(container: EmulatorContainerInfo | undefined) {
  return container?.Names?.[0]?.replace(/^\//, '');
}

function findContainerByContainerName(containerName: string | undefined, containers: EmulatorContainerInfo[]) {
  const normalizedName = normalizeText(containerName);
  if (!normalizedName) {
    return undefined;
  }

  return containers.find((container) =>
    (container.Names ?? []).some((name) => normalizeText(name) === normalizedName) ||
    normalizeText(getContainerName(container)) === normalizedName,
  );
}

function findContainerByNode(
  nodeName: string | undefined,
  nodeIp: string | undefined,
  containerHint: string | undefined,
  containers: EmulatorContainerInfo[],
) {
  return findContainerByContainerName(containerHint, containers) ??
    findContainerById(containerHint, containers) ??
    findContainerByName(nodeName, containers) ??
    findContainerByIP(nodeIp, containers);
}

function findContainerByName(nodeName: string | undefined, containers: EmulatorContainerInfo[]) {
  const normalizedName = normalizeText(nodeName);
  if (!normalizedName) {
    return undefined;
  }

  return containers.find((container) => {
    const emulatorInfo = container.meta?.emulatorInfo;
    return [
      emulatorInfo?.name,
      emulatorInfo?.displayname,
      ...(container.Names ?? []),
    ].some((value) => {
      const candidate = normalizeText(value);
      return Boolean(candidate) && (candidate.includes(normalizedName) || normalizedName.includes(candidate));
    });
  });
}

function findContainerByIP(ip: string | undefined, containers: EmulatorContainerInfo[]) {
  const normalizedIp = normalizeIPAddress(ip);
  if (!normalizedIp) {
    return undefined;
  }

  return containers.find((container) =>
    container.meta?.emulatorInfo?.nets?.some((net) =>
      normalizeIPAddress(net.address) === normalizedIp,
    ),
  );
}

function findBestContainerIP(container: EmulatorContainerInfo | undefined, preferredIp: string | undefined) {
  const preferred = normalizeIPAddress(preferredIp);
  const nets = container?.meta?.emulatorInfo?.nets ?? [];
  if (preferred && nets.some((net) => normalizeIPAddress(net.address) === preferred)) {
    return preferred;
  }

  return normalizeIPAddress(nets.find((net) => normalizeIPAddress(net.address))?.address);
}

function normalizeIPAddress(value: string | undefined) {
  return value?.trim().split('/')[0] || undefined;
}

function normalizeText(value: string | undefined) {
  return value?.replace(/^\//, '').trim().toLowerCase() ?? '';
}

function readIPv4(view: DataView, offset: number) {
  return [
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  ].join('.');
}

function protocolName(protocol: number) {
  if (protocol === PROTO_ICMP) {
    return 'icmp';
  }
  if (protocol === PROTO_TCP) {
    return 'tcp';
  }
  if (protocol === PROTO_UDP) {
    return 'udp';
  }
  return `ip-${protocol}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
