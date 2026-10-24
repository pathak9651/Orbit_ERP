import { useCallback, useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LocationMap from './LocationMap.jsx'
import { checkIn, checkOut, getAdminMonthlyAttendance, getAttendance, updateAttendanceLocation } from '../../services/api.js'

const timeLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : ' - '
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : ' - '

/** Requests precise browser GPS coordinates for the employee's attendance record. */
function requestCurrentLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('This browser cannot access location. Open the app on localhost or a secure HTTPS connection.'))
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, (error) => {
    const message = error.code === 1
      ? 'Location permission was denied. Allow location access in your browser settings to check in.'
      : error.code === 3
        ? 'Could not get your location in time. Try again with location services enabled.'
        : 'Could not read your location. Check your device location settings and try again.'
    reject(new Error(message))
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }))
}

/** Produces the YYYY-MM value used by the administrator attendance report. */
function currentMonth() {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}`
}

/** Loads and displays the role-aware, month-by-month organization attendance report. */
function AdminMonthlyAttendance() {
  const [month, setMonth] = useState(currentMonth)
  const [report, setReport] = useState({ users: [], days: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setReport(await getAdminMonthlyAttendance(month)) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])

  const totals = report.users.reduce((summary, person) => ({
    present: summary.present + person.present,
    absent: summary.absent + person.absent,
    leave: summary.leave + (person.leave || 0),
  }), { present: 0, absent: 0, leave: 0 })

  return <section className="main-panel"><main className="dashboard-content work-page-content admin-attendance-content">
    <div className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Monthly attendance</h1><p>Review each user - s attendance, job role, and check-in location.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <section className="panel-card attendance-report-controls">
      <label className="field-label">Select month<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedLocation(null) }} /></label>
      <div className="attendance-report-summary"><span><strong>{report.users.length}</strong> users</span><span><strong>{totals.present}</strong> present days</span><span><strong>{totals.absent}</strong> absent days</span><span><strong>{totals.leave}</strong> leave days</span></div>
      <p>Weekdays are counted as scheduled workdays. Weekends are excluded; public holidays are not currently configured.</p>
    </section>
    <section className="panel-card work-list-card admin-attendance-table-card">
      <div className="section-heading"><div><h2>Users and daily status</h2><p>{loading ? 'Loading monthly report - ' : `${report.days.length} scheduled weekdays  -  ${report.timeZone || 'Asia/Kolkata'}`}</p></div><button className="text-button" type="button" onClick={load} disabled={loading}>Refresh</button></div>
      {loading ? <p className="user-table-state">Loading attendance - </p> : report.users.length === 0 ? <p className="user-table-state">No users found.</p> : <div className="attendance-table-wrap monthly-attendance-scroll"><table className="work-table monthly-attendance-table"><thead><tr><th className="attendance-name-column">User</th><th>Job role</th><th>Department</th><th>Present</th><th>Absent</th><th>Leave</th>{report.days.map((day) => <th className="attendance-day-heading" key={day} title={day}>{Number(day.slice(-2))}</th>)}</tr></thead><tbody>{report.users.map((person) => <tr key={person.id}>
        <td className="attendance-name-column"><strong>{person.name}</strong><small>{person.email}{person.pending ? ' (pending approval)' : ''}</small></td><td>{person.roleName}</td><td>{person.department}</td><td><span className="monthly-count present-count">{person.present}</span></td><td><span className="monthly-count absent-count">{person.absent}</span></td><td><span className="monthly-count leave-count">{person.leave || 0}</span></td>
        {person.daily.map((day) => <td className="attendance-day-cell" key={day.dateKey} title={`${day.dateKey}: ${day.status}`}>{day.status === 'present' && day.checkInLocation ? <button className="attendance-day-dot day-present attendance-location-trigger" type="button" aria-label={`Show ${person.name}'s check-in location on ${day.dateKey}`} onClick={() => setSelectedLocation({ location: day.checkInLocation, heading: `${person.name}  -  ${day.dateKey}` })}>P</button> : <span className={`attendance-day-dot day-${day.status}`} aria-label={day.status}>{day.status === 'present' ? 'P' : day.status === 'absent' ? 'A' : day.status === 'leave' ? 'L' : '-'}</span>}</td>)}
      </tr>)}</tbody></table></div>}
      {selectedLocation && <LocationMap location={selectedLocation.location} heading={selectedLocation.heading} />}
      <div className="attendance-legend"><span><i className="day-present">P</i> Present (select for map)</span><span><i className="day-absent">A</i> Absent</span><span><i className="day-leave">L</i> Approved leave</span><span><i className="day-pending">-</i> Pending approval</span></div>
    </section>
  </main><Footer /></section>
}

/** Lets an employee check in/out and review their recorded attendance and GPS location. */
function PersonalAttendance({ user }) {
  const [data, setData] = useState({ today: null, records: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const canSeeTeam = ['hr', 'manager'].includes(user.role)
  const load = useCallback(async () => {
    setError('')
    try { setData(await getAttendance()) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function markAttendance(action) {
    setBusy(true); setError(''); setNotice('')
    try {
      let result
      if (action === 'in') {
        const position = await requestCurrentLocation()
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }
        result = await checkIn(location)
      } else {
        result = await checkOut()
      }
      setNotice(result.message)
      setSelectedLocation(null)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function captureCurrentLocation() {
    setLocationBusy(true); setError(''); setNotice('')
    try {
      const position = await requestCurrentLocation()
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }
      const result = await updateAttendanceLocation(location)
      setNotice(result.message)
      setSelectedLocation(null)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setLocationBusy(false) }
  }

  const currentLocation = selectedLocation || (data.today?.checkInLocation ? { location: data.today.checkInLocation, heading: 'Today - s check-in location' } : null)

  return <section className="main-panel"><main className="dashboard-content work-page-content">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Attendance</h1><p>Record your workday and review attendance activity.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
    <section className="panel-card attendance-today"><div><span className="eyebrow">TODAY  -  {dateLabel(data.dateKey)}</span><h2>{!data.today ? 'Not checked in yet' : data.today.checkOut ? 'Workday complete' : 'You are checked in'}</h2><p>{data.today ? `Check in ${timeLabel(data.today.checkIn)}  -  Check out ${timeLabel(data.today.checkOut)}` : 'Check in when you start work. Your browser will ask to share your current location.'}</p></div>
      <div className="attendance-actions"><button className="button button-primary" type="button" onClick={() => markAttendance('in')} disabled={busy || loading || Boolean(data.today)}>{busy ? 'Getting location - ' : 'Check in'}</button><button className="button button-secondary" type="button" onClick={() => markAttendance('out')} disabled={busy || loading || !data.today || Boolean(data.today?.checkOut)}>Check out</button>{data.today && !data.today.checkOut && !data.today.checkInLocation && <button className="button button-secondary" type="button" onClick={captureCurrentLocation} disabled={locationBusy || loading}>{locationBusy ? 'Getting location - ' : 'Capture current location'}</button>}</div>
    </section>
    <section className="panel-card work-list-card"><div className="section-heading"><div><h2>{canSeeTeam ? 'Today - s team attendance' : 'My attendance'}</h2><p>{canSeeTeam ? 'Visible team records based on your role.' : 'Your recorded attendance.'}</p></div><button className="text-button" type="button" onClick={load}>Refresh</button></div>
      {loading ? <p className="user-table-state">Loading attendance - </p> : !data.records?.length ? <p className="user-table-state">No attendance records to show.</p> : <div className="attendance-table-wrap"><table className="work-table"><thead><tr>{canSeeTeam && <th>Team member</th>}<th>Date</th><th>Location</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead><tbody>{data.records.map((record) => <tr key={record._id}>{canSeeTeam && <td><strong>{record.user?.name}</strong><small>{record.user?.email}</small></td>}<td>{dateLabel(record.dateKey)}</td><td>{record.checkInLocation ? <button className="text-button attendance-map-button" type="button" onClick={() => setSelectedLocation({ location: record.checkInLocation, heading: `${record.user?.name || 'My'}  -  ${dateLabel(record.dateKey)}` })}>Show map</button> : 'Not recorded'}</td><td>{timeLabel(record.checkIn)}</td><td>{timeLabel(record.checkOut)}</td><td><span className={`task-status ${record.checkOut ? 'status-completed' : 'status-in-progress'}`}>{record.checkOut ? 'Complete' : 'In progress'}</span></td></tr>)}</tbody></table></div>}
    </section>
    {currentLocation && <LocationMap location={currentLocation.location} heading={currentLocation.heading} />}
  </main><Footer /></section>
}

/** Chooses the administrator report or personal attendance screen based on the role. */
export default function AttendancePage({ user }) {
  return user.role === 'admin' ? <AdminMonthlyAttendance /> : <PersonalAttendance user={user} />
}


