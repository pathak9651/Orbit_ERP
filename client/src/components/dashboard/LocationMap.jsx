function validCoordinates(location) {
  const latitude = Number(location?.latitude)
  const longitude = Number(location?.longitude)
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}

export default function LocationMap({ location, heading = 'Check-in location' }) {
  if (!validCoordinates(location)) return null
  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  const coordinates = `${latitude},${longitude}`
  const mapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(coordinates)}&z=17&output=embed`
  const externalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`
  const formatTimestamp = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not reported'

  return <section className="panel-card attendance-location-card">
    <div className="attendance-location-heading"><div><h2>{heading}</h2><p>{latitude.toFixed(6)}, {longitude.toFixed(6)}{location.accuracyMeters !== null && location.accuracyMeters !== undefined && Number.isFinite(Number(location.accuracyMeters)) ? ` · Device accuracy ±${Math.round(Number(location.accuracyMeters))} m` : ' · Device accuracy unavailable'}</p><p>Device-reported fix: {formatTimestamp(location.clientReportedAt)} · Server recorded: {formatTimestamp(location.recordedAt)}</p></div><a className="text-button" href={externalUrl} target="_blank" rel="noreferrer">Open map</a></div>
    <iframe className="attendance-location-map" src={mapUrl} title={`${heading} on Google Maps`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
  </section>
}



