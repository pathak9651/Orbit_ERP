import test from 'node:test'
import assert from 'node:assert/strict'
import { assessAttendanceLocation, calculateDistanceMeters, getAttendanceLocationPolicy, validateAttendanceLocationConfiguration } from '../services/attendanceLocation.js'

test('distance calculation measures a plausible distance between GPS points', () => {
  const distance = calculateDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })
  assert.ok(distance > 111_000 && distance < 112_000)
})

test('low accuracy, outside-radius, and device-clock differences are review flags only', () => {
  const policy = getAttendanceLocationPolicy({
    ATTENDANCE_MAX_GPS_ACCURACY_METERS: '100',
    ATTENDANCE_SITE_LATITUDE: '0',
    ATTENDANCE_SITE_LONGITUDE: '0',
    ATTENDANCE_GEOFENCE_RADIUS_METERS: '200',
  })
  const flags = assessAttendanceLocation({
    location: { latitude: 0.01, longitude: 0, accuracyMeters: 300, clientReportedAt: '2026-10-24T09:00:00.000Z' },
    serverTime: new Date('2026-10-24T09:10:00.000Z'),
    policy,
  })
  assert.deepEqual(flags, ['low-accuracy', 'outside-configured-workplace-radius', 'device-time-differs-from-server'])
})

test('an unusually fast location change is recorded as a review flag', () => {
  const flags = assessAttendanceLocation({
    location: { latitude: 0, longitude: 20, accuracyMeters: 10 },
    serverTime: new Date('2026-10-24T10:00:00.000Z'),
    previousRecord: { checkIn: new Date('2026-10-24T09:00:00.000Z'), checkInLocation: { latitude: 0, longitude: 0 } },
    policy: { maximumAccuracyMeters: 100, site: null },
  })
  assert.deepEqual(flags, ['unusual-location-change', 'possible-impossible-travel'])
})

test('an optional office geofence must have a complete, valid configuration', () => {
  assert.doesNotThrow(() => validateAttendanceLocationConfiguration({}))
  assert.throws(() => validateAttendanceLocationConfiguration({ ATTENDANCE_SITE_LATITUDE: '12.9' }), /Configure both/)
  assert.throws(() => validateAttendanceLocationConfiguration({ ATTENDANCE_SITE_LATITUDE: '91', ATTENDANCE_SITE_LONGITUDE: '77' }), /valid latitude/)
})
