export const seedLabels = {
  'org.seedsecuritylabs.seedemu.meta.nodename': 'router-a',
  'org.seedsecuritylabs.seedemu.meta.role': 'router',
  'org.seedsecuritylabs.seedemu.meta.asn': '150',
  'org.seedsecuritylabs.seedemu.meta.geo.lat': '31.2304',
  'org.seedsecuritylabs.seedemu.meta.geo.lon': '121.4737',
  'org.seedsecuritylabs.seedemu.meta.net.0.name': 'net0',
  'org.seedsecuritylabs.seedemu.meta.net.0.address': '10.0.0.2/24',
};

export const seedNetLabels = {
  'org.seedsecuritylabs.seedemu.meta.name': 'net0',
  'org.seedsecuritylabs.seedemu.meta.scope': '150',
  'org.seedsecuritylabs.seedemu.meta.type': 'local',
  'org.seedsecuritylabs.seedemu.meta.prefix': '10.0.0.0/24',
};

export const containerFixture = {
  Id: 'node-1234567890',
  Names: ['/router-a'],
  Labels: seedLabels,
};

export const nonSeedContainerFixture = {
  Id: 'other-1234567890',
  Names: ['/not-seed'],
  Labels: {},
};

export const networkFixture = {
  Id: 'net-1234567890',
  Name: 'net0',
  Labels: seedNetLabels,
};
