export const plannedShellOrbitResponse = {
  ok: true,
  result: {
    selected_records: [
      {
        argument_of_perigee_deg: 0,
        eccentricity: 0,
        epoch_utc: '2026-01-01T00:00:00Z',
        inclination_deg: 53,
        line1: 'PLANNED S1 910001',
        line2: '53.0000 0.0000 0.0000 15.078199602',
        mean_anomaly_deg: 0,
        mean_motion_rev_per_day: 15.078199602,
        norad_id: 910001,
        plane_index: 1,
        raan_deg: 0,
        satellite_name: 'SAT-910001',
      },
      {
        argument_of_perigee_deg: 0,
        eccentricity: 0,
        epoch_utc: '2026-01-01T00:00:00Z',
        inclination_deg: 53,
        line1: 'PLANNED S2 910002',
        line2: '53.0000 0.0000 16.3636 15.078199602',
        mean_anomaly_deg: 16.3636,
        mean_motion_rev_per_day: 15.078199602,
        norad_id: 910002,
        plane_index: 1,
        raan_deg: 0,
        satellite_name: 'SAT-910002',
      },
    ],
    shell_selection: {
      plane_manifest: [
        {
          plane_id: 'S1-P001',
          norad_ids: [910001],
        },
        {
          plane_id: 'S2-P001',
          norad_ids: [910002],
        },
      ],
    },
  },
};

export const starlinkGatewaysResponse = {
  ok: true,
  result: [
    {
      id: 'starlink-gs-test-001',
      name: 'Mock Gateway Alpha',
      city: 'Mock City',
      longitude: 121.4737,
      latitude: 31.2304,
      altitudeMeters: 4,
    },
    {
      id: 'starlink-gs-test-002',
      name: 'Mock Gateway Beta',
      city: 'Mock Town',
      longitude: 118.7969,
      latitude: 32.0603,
      altitudeMeters: 12,
    },
  ],
};

export const emulatorContainersResponse = {
  ok: true,
  result: [
    {
      Id: 'container-alpha-1234567890',
      Names: ['/as150h-host_0-10.150.0.71'],
      meta: {
        emulatorInfo: {
          name: 'host_0',
          role: 'Host',
          displayname: 'Host 0',
          longitude: '120.1551',
          latitude: '30.2741',
        },
      },
    },
    {
      Id: 'container-router-1234567890',
      Names: ['/as150brd-router0-10.150.0.254'],
      meta: {
        emulatorInfo: {
          name: 'router0',
          role: 'BorderRouter',
          displayname: 'Router 0',
          longitude: '113.2644',
          latitude: '23.1291',
        },
      },
    },
  ],
};
