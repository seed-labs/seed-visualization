require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const test = require('node:test');
const satellite = require('satellite.js');

const {
  generateOrbitPoints,
  getSatellitePosition,
  getSatelliteSpeed,
} = require('../../src/utils/satellite');

const tleLine1 = '1 25544U 98067A   20357.54791667  .00001264  00000-0  29635-4 0  9993';
const tleLine2 = '2 25544  51.6464  85.5016 0002181  83.6381  42.2724 15.49355538256311';

test('computes a satellite position with finite coordinates', () => {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
  const position = getSatellitePosition(satrec, new Date('2020-12-22T13:09:00Z'));

  assert.ok(position);
  assert.equal(Number.isFinite(position.lat), true);
  assert.equal(Number.isFinite(position.lon), true);
  assert.equal(Number.isFinite(position.height_km), true);
});

test('computes a positive orbital speed', () => {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
  const speed = getSatelliteSpeed(satrec, new Date('2020-12-22T13:09:00Z'));

  assert.equal(typeof speed, 'number');
  assert.equal(speed > 0, true);
});

test('generates an orbit polyline with speed metadata', () => {
  const result = generateOrbitPoints(tleLine1, tleLine2);

  assert.equal(result.points.length > 300, true);
  assert.equal(typeof result.speed_km_s, 'number');
});
