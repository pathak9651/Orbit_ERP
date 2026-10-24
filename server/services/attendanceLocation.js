import Attendance from '../models/attendance.js'

/** Reads optional workplace geofence settings and conservative GPS review thresholds. */
export function getAttendanceLocationPolicy(environment = process.env) {
  const maximumAccuracyMeters = Number(environment.ATTENDANCE_MAX_GPS_ACCURACY_METERS || 100)
  const siteLatitude = Number(environment.ATTENDANCE_SITE_LATITUDE)
  const siteLongitude = Number(environment.ATTENDANCE_SITE_LONGITUDE)
  const radiusMeters = Number(environment.ATTENDANCE_GEOFENCE_RADIUS_METERS || 200)
  const hasConfiguredSite = environment.ATTENDANCE_SITE_LATITUDE !== undefined && environment.ATTENDANCE_SITE_LATITUDE !== ''
    && environment.ATTENDANCE_SITE_LONGITUDE !== undefined && environment.ATTENDANCE_SITE_LONGITUDE !== ''
    && Number.isFinite(siteLatitude) && siteLatitude >= -90 && siteLatitude <= 90
    && Number.isFinite(siteLongitude) && siteLongitude >= -180 && siteLongitude <= 180

  return {
    maximumAccuracyMeters: Number.isFinite(maximumAccuracyMeters) && maximumAccuracyMeters >= 0 ? maximumAccuracyMeters : 100,
    site: hasConfiguredSite ? { latitude: siteLatitude, longitude: siteLongitude, radiusMeters: Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 200 } : null,
  }
}

/** Fails startup for partial or invalid office coordinates instead of silently skipping the geofence. */
export function validateAttendanceLocationConfiguration(environment = process.env) {
  const hasLatitude = environment.ATTENDANCE_SITE_LATITUDE !== undefined && environment.ATTENDANCE_SITE_LATITUDE !== ''
  const hasLongitude = environment.ATTENDANCE_SITE_LONGITUDE !== undefined && environment.ATTENDANCE_SITE_LONGITUDE !== ''
  if (hasLatitude !== hasLongitude) throw new Error('Configure both ATTENDANCE_SITE_LATITUDE and ATTENDANCE_SITE_LONGITUDE, or leave both unset.')
  if (hasLatitude) {
    const policy = getAttendanceLocationPolicy(environment)
    if (!policy.site) throw new Error('Attendance site coordinates must be valid latitude and longitude values.')
    const configuredRadius = environment.ATTENDANCE_GEOFENCE_RADIUS_METERS
    if (configuredRadius !== undefined && (!Number.isFinite(Number(configuredRadius)) || Number(configuredRadius) <= 0)) {
      throw new Error('ATTENDANCE_GEOFENCE_RADIUS_METERS must be a positive number.')
    }
  }
  const accuracy = environment.ATTENDANCE_MAX_GPS_ACCURACY_METERS
  if (accuracy !== undefined && (!Number.isFinite(Number(accuracy)) || Number(accuracy) < 0)) {
    throw new Error('ATTENDANCE_MAX_GPS_ACCURACY_METERS must be a non-negative number.')
  }
}

/** Measures straight-line distance between two GPS points using the haversine formula. */
export function calculateDistanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDifference = radians(second.latitude - first.latitude)
  const longitudeDifference = radians(second.longitude - first.longitude)
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDifference / 2) ** 2
  const boundedHaversine = Math.min(1, Math.max(0, haversine))
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine))
}

/** Flags readings for human review without changing the attendance outcome. */
export function assessAttendanceLocation({ location, serverTime = new Date(), previousRecord = null, policy = getAttendanceLocationPolicy() }) {
  const flags = []
  if (location.accuracyMeters == null) flags.push('accuracy-unavailable')
  else if (location.accuracyMeters > policy.maximumAccuracyMeters) flags.push('low-accuracy')

  if (policy.site && calculateDistanceMeters(location, policy.site) > policy.site.radiusMeters) {
    flags.push('outside-configured-workplace-radius')
  }

  const clientTime = location.clientReportedAt ? new Date(location.clientReportedAt) : null
  if (clientTime && Math.abs(serverTime.getTime() - clientTime.getTime()) > 5 * 60 * 1000) {
    flags.push('device-time-differs-from-server')
  }

  const previousLocation = previousRecord?.checkInLocation
  const previousTime = previousRecord?.checkIn
  if (previousLocation && previousTime) {
    const elapsedHours = (serverTime.getTime() - new Date(previousTime).getTime()) / 3_600_000
    const distanceMeters = calculateDistanceMeters(location, previousLocation)
    if (distanceMeters > 1_000_000 && elapsedHours < 48) flags.push('unusual-location-change')
    if (elapsedHours > 0 && distanceMeters / 1000 / elapsedHours > 250) flags.push('possible-impossible-travel')
  }

  return [...new Set(flags)]
}
/** Removes GPS and free-text review details after the configured retention period, keeping attendance totals. */
export async function purgeExpiredAttendanceLocations() {
  const configuredDays = Number(process.env.ATTENDANCE_LOCATION_RETENTION_DAYS || 90)
  const retentionDays = Number.isInteger(configuredDays) && configuredDays >= 1 ? configuredDays : 90
  const expiresBefore = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await Attendance.updateMany(
    {
      checkIn: { $lt: expiresBefore },
      $or: [
        { checkInLocation: { $ne: null } },
        { locationCorrection: { $ne: null } },
        { locationExceptionReason: { $ne: '' } },
        { locationReviewNote: { $ne: '' } },
      ],
    },
    { $unset: { checkInLocation: 1, locationCorrection: 1, locationReviewNote: 1, locationExceptionReason: 1 } },
  )
  return result.modifiedCount
}

/** Runs cleanup once a day; attendance rows remain for payroll and monthly reporting. */
export function scheduleAttendanceLocationRetention() {
  const cleanupTimer = setInterval(() => {
    purgeExpiredAttendanceLocations().catch((error) => console.error('Attendance GPS retention cleanup failed:', error.message))
  }, 24 * 60 * 60 * 1000)
  cleanupTimer.unref()
  return purgeExpiredAttendanceLocations().catch((error) => {
    console.error('Initial attendance GPS retention cleanup failed:', error.message)
    return 0
  })
}
