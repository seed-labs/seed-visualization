export const containersResponse = {
  ok: true,
  result: [
    {
      Id: 'node-1',
      meta: {
        emulatorInfo: {
          asn: 150,
          name: 'router-a',
          role: 'router',
          nets: [{ name: 'net0', address: '10.0.0.2/24' }],
        },
      },
    },
  ],
};

export const networksResponse = {
  ok: true,
  result: [
    {
      Id: 'net-1',
      meta: {
        emulatorInfo: {
          scope: '150',
          name: 'net0',
          type: 'local',
          prefix: '10.0.0.0/24',
        },
      },
    },
  ],
};
