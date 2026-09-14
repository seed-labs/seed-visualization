export const mapContainersResponse = {
  ok: true,
  result: [
    {
      Id: 'router-150',
      Names: ['/as150r-r0-10.150.0.254'],
      Labels: {
        'org.seedsecuritylabs.seedemu.meta.class': '["RoutingService"]',
      },
      NetworkSettings: {
        Networks: {
          output_net_150_net0: {
            NetworkID: 'net-150',
            MacAddress: '02:00:00:00:01:50',
            IPAddress: '10.150.0.254',
          },
          output_net_ix_ix100: {
            NetworkID: 'ix-100',
            MacAddress: '02:00:00:00:01:51',
            IPAddress: '10.100.0.150',
          },
        },
      },
      meta: {
        emulatorInfo: {
          asn: 150,
          name: 'r0',
          role: 'Router',
          displayname: 'AS150 Router',
          latitude: '31.2304',
          longitude: '121.4737',
          nets: [
            { name: 'net0', address: '10.150.0.254/24' },
            { name: 'ix100', address: '10.100.0.150/24' },
          ],
        },
      },
    },
    {
      Id: 'host-150',
      Names: ['/as150h-host_0-10.150.0.71'],
      Labels: {},
      NetworkSettings: {
        Networks: {
          output_net_150_net0: {
            NetworkID: 'net-150',
            MacAddress: '02:00:00:00:01:52',
            IPAddress: '10.150.0.71',
          },
        },
      },
      meta: {
        emulatorInfo: {
          asn: 150,
          name: 'host_0',
          role: 'Host',
          displayname: 'AS150 Host',
          latitude: '31.24',
          longitude: '121.48',
          nets: [{ name: 'net0', address: '10.150.0.71/24' }],
        },
      },
    },
    {
      Id: 'router-151',
      Names: ['/as151r-r0-10.151.0.254'],
      Labels: {},
      NetworkSettings: {
        Networks: {
          output_net_151_net0: {
            NetworkID: 'net-151',
            MacAddress: '02:00:00:00:01:53',
            IPAddress: '10.151.0.254',
          },
          output_net_ix_ix100: {
            NetworkID: 'ix-100',
            MacAddress: '02:00:00:00:01:54',
            IPAddress: '10.100.0.151',
          },
        },
      },
      meta: {
        emulatorInfo: {
          asn: 151,
          name: 'r0',
          role: 'BorderRouter',
          displayname: 'AS151 Border Router',
          latitude: '35.6762',
          longitude: '139.6503',
          nets: [
            { name: 'net0', address: '10.151.0.254/24' },
            { name: 'ix100', address: '10.100.0.151/24' },
          ],
        },
      },
    },
  ],
};

export const mapNetworksResponse = {
  ok: true,
  result: [
    {
      Id: 'net-150',
      Name: 'output_net_150_net0',
      Labels: {},
      meta: {
        emulatorInfo: {
          scope: '150',
          name: 'net0',
          type: 'local',
          prefix: '10.150.0.0/24',
          latitude: '31.23',
          longitude: '121.47',
        },
      },
    },
    {
      Id: 'net-151',
      Name: 'output_net_151_net0',
      Labels: {},
      meta: {
        emulatorInfo: {
          scope: '151',
          name: 'net0',
          type: 'local',
          prefix: '10.151.0.0/24',
          latitude: '35.67',
          longitude: '139.65',
        },
      },
    },
    {
      Id: 'ix-100',
      Name: 'output_net_ix_ix100',
      Labels: {
        'org.seedsecuritylabs.seedemu.meta.class': '["InternetExchangeService"]',
      },
      meta: {
        emulatorInfo: {
          scope: 'ix',
          name: 'ix100',
          displayname: 'IX 100',
          type: 'global',
          prefix: '10.100.0.0/24',
          latitude: '1.3521',
          longitude: '103.8198',
        },
      },
    },
  ],
};
