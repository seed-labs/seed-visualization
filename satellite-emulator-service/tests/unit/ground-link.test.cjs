require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createNearestGroundLinks,
  isGroundStation,
  isSatellitePosition,
} = require('../../src/utils/ground-link');

test('validates satellite positions and ground stations', () => {
  assert.equal(isSatellitePosition({
    id: '910001',
    longitude: 0,
    latitude: 0,
    altitudeKm: 550,
  }), true);

  assert.equal(isSatellitePosition({
    id: '910001',
    longitude: '0',
    latitude: 0,
    altitudeKm: 550,
  }), false);

  assert.equal(isGroundStation({
    id: 'gs-001',
    name: 'Gateway 001',
    city: 'Quito',
    longitude: -78.5,
    latitude: -0.2,
    altitudeMeters: 2850,
  }), true);

  assert.equal(isGroundStation({
    id: 'gs-001',
    name: 'Gateway 001',
    longitude: -78.5,
    latitude: -0.2,
    altitudeMeters: 2850,
  }), false);
});

test('creates nearest ground links only for satellites within range', () => {
  const satellites = [
    {id: 'sat-near', longitude: 0, latitude: 0, altitudeKm: 550},
    {id: 'sat-far', longitude: 120, latitude: 0, altitudeKm: 550},
  ];

  const stations = [
    {id: 'gs-origin', name: 'Origin Gateway', city: 'Origin', longitude: 0, latitude: 0, altitudeMeters: 0},
    {id: 'gs-east', name: 'East Gateway', city: 'East', longitude: 5, latitude: 0, altitudeMeters: 0},
  ];

  const links = createNearestGroundLinks(satellites, stations);

  assert.deepEqual(links.map((link) => [link.satelliteId, link.stationId]), [
    ['sat-near', 'gs-origin'],
  ]);
  assert.equal(links[0].distanceKm < 1100, true);
});

test('supports limiting nearest-link generation to selected satellites', () => {
  const links = createNearestGroundLinks(
    [
      {id: 'sat-a', longitude: 0, latitude: 0, altitudeKm: 550},
      {id: 'sat-b', longitude: 0, latitude: 0, altitudeKm: 550},
    ],
    [
      {id: 'gs-origin', name: 'Origin Gateway', city: 'Origin', longitude: 0, latitude: 0, altitudeMeters: 0},
    ],
    ['sat-b'],
  );

  assert.deepEqual(links.map((link) => link.satelliteId), ['sat-b']);
});
