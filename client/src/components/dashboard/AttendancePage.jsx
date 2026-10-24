import { useCallback, useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import LocationMap from './LocationMap.jsx'
import { checkIn, checkOut, getAdminMonthlyAttendance, getAttendance, getAttendanceLocationReviews, requestAttendanceLocationCorrection, reviewAttendanceLocation } from '../../services/api.js'
import Pagination from '../common/Pagination.jsx'

const timeLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : ' - '
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : ' - '
const locationFlagLabels = {
  'accuracy-unavailable': 'GPS accuracy was not provided',
  'low-accuracy': 'GPS reading has low accuracy',
  'outside-configured-workplace-radius': 'Location is outside the configured workplace radius',
  'device-time-differs-from-server': 'Device location time differs from server time',
  'unusual-location-change': 'Location changed unusually since the previous check-in',
  'possible-impossible-travel': 'Travel speed needs review',
}
const describeLocationFlags = (flags = []) => flags.map((flag) => locationFlagLabels[flag] || flag).join('; ')

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
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setReport(await getAdminMonthlyAttendance(month, { page })) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [month, page])
  useEffect(() => { load() }, [load])

  const pageTotals = report.users.reduce((summary, person) => ({
    present: summary.present + person.present,
    absent: summary.absent + person.absent,
    leave: summary.leave + (person.leave || 0),
  }), { present: 0, absent: 0, leave: 0 })
  const totals = report.summary || pageTotals

  async function reviewLocation(attendanceId) {
    const message = window.prompt('Add a short note about this GPS review:')
    if (!message?.trim()) return
    try {
      await reviewAttendanceLocation(attendanceId, 'reviewed', message.trim())
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function reviewCorrection(attendanceId, decision) {
    const message = window.prompt('Add a short correction review note:')
    if (!message?.trim()) return
    try {
      await reviewAttendanceLocation(attendanceId, decision, message.trim())
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  return <section className="main-panel"><main className="dashboard-content work-page-content admin-attendance-content">
    <div className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Monthly attendance</h1><p>Review each user - s attendance, job role, and check-in location.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <section className="panel-card attendance-report-controls">
      <label className="field-label">Select month<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); setSelectedLocation(null) }} /></label>
      <div className="attendance-report-summary"><span><strong>{report.pagination?.totalItems ?? report.users.length}</strong> users</span><span><strong>{totals.present}</strong> present days</span><span><strong>{totals.absent}</strong> absent days</span><span><strong>{totals.leave}</strong> leave days</span></div>
      <p>Weekdays are counted as scheduled workdays. Weekends are excluded; public holidays are not currently configured.</p>
    </section>
    <section className="panel-card work-list-card admin-attendance-table-card">
      <div className="section-heading"><div><h2>Users and daily status</h2><p>{loading ? 'Loading monthly report - ' : `${report.days.length} scheduled weekdays  -  ${report.timeZone || 'Asia/Kolkata'}`}</p></div><button className="text-button" type="button" onClick={load} disabled={loading}>Refresh</button></div>
      {loading ? <p className="user-table-state">Loading attendance - </p> : report.users.length === 0 ? <p className="user-table-state">No users found.</p> : <div className="attendance-table-wrap monthly-attendance-scroll"><table className="work-table monthly-attendance-table"><thead><tr><th className="attendance-name-column">User</th><th>Job role</th><th>Department</th><th>Present</th><th>Absent</th><th>Leave</th>{report.days.map((day) => <th className="attendance-day-heading" key={day} title={day}>{Number(day.slice(-2))}</th>)}</tr></thead><tbody>{report.users.map((person) => <tr key={person.id}>
        <td className="attendance-name-column"><strong>{person.name}</strong><small>{person.email}{person.pending ? ' (pending approval)' : ''}</small></td><td>{person.roleName}</td><td>{person.department}</td><td><span className="monthly-count present-count">{person.present}</span></td><td><span className="monthly-count absent-count">{person.absent}</span></td><td><span className="monthly-count leave-count">{person.leave || 0}</span></td>
        {person.daily.map((day) => <td className="attendance-day-cell" key={day.dateKey} title={`${day.dateKey}: ${day.status}${day.locationFlags?.length ? `; review flags: ${describeLocationFlags(day.locationFlags)}` : ''}`}>
          {day.status === 'present' ? <>{day.checkInLocation ? <button className="attendance-day-dot day-present attendance-location-trigger" type="button" aria-label={`Show ${person.name}'s recorded check-in location on ${day.dateKey}`} onClick={() => setSelectedLocation({ location: day.checkInLocation, heading: `${person.name}  -  ${day.dateKey} recorded location` })}>{day.locationReviewStatus === 'pending' ? '!' : 'P'}</button> : <span className="attendance-day-dot day-present" title={day.locationExceptionReason || 'GPS location unavailable'}>{day.locationReviewStatus === 'pending' ? '!' : 'P'}</span>}{day.locationExceptionReason && <small>GPS unavailable: {day.locationExceptionReason}</small>}{day.locationCorrection?.status === 'approved' && <button className="text-button" type="button" onClick={() => setSelectedLocation({ location: day.locationCorrection.location, heading: `${person.name}  -  approved correction evidence captured ${timeLabel(day.locationCorrection.location.recordedAt)}` })}>View approved correction evidence</button>}{day.locationReviewStatus === 'pending' && <button className="text-button" type="button" onClick={() => reviewLocation(day.attendanceId)}>Review flag</button>}{day.locationCorrection?.status === 'pending' && <><span className="task-status status-in-progress" title={day.locationCorrection.reason}>Correction requested: {day.locationCorrection.reason}</span><button className="text-button" type="button" onClick={() => reviewCorrection(day.attendanceId, 'approve-correction')}>Approve correction</button><button className="text-button" type="button" onClick={() => reviewCorrection(day.attendanceId, 'reject-correction')}>Reject correction</button></>}</> : <span className={`attendance-day-dot day-${day.status}`} aria-label={day.status}>{day.status === 'absent' ? 'A' : day.status === 'leave' ? 'L' : '-'}</span>}
        </td>)}
      </tr>)}</tbody></table></div>}
      {selectedLocation && <LocationMap location={selectedLocation.location} heading={selectedLocation.heading} />}
      <Pagination pagination={report.pagination} onPageChange={setPage} disabled={loading} />
      <div className="attendance-legend"><span><i className="day-present">P</i> Present (select for map)</span><span><i className="day-absent">A</i> Absent</span><span><i className="day-leave">L</i> Approved leave</span><span><i className="day-pending">-</i> Pending approval</span></div>
    </section>
  </main><Footer /></section>
}

/** Lets an employee check in/out and review their recorded attendance and GPS location. */
function PersonalAttendance({ user }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ today: null, records: [] })
  const [reviewQueue, setReviewQueue] = useState({ records: [], pagination: null })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionRecordId, setCorrectionRecordId] = useState('')
  const [gpsUnavailableReason, setGpsUnavailableReason] = useState('')
  const [manualCheckInReason, setManualCheckInReason] = useState('')
  const [reviewPage, setReviewPage] = useState(1)
  const canSeeTeam = ['hr', 'manager'].includes(user.role)
  const load = useCallback(async () => {
    setError('')
    try {
      const [attendance, reviews] = await Promise.all([
        getAttendance({ page }),
        canSeeTeam ? getAttendanceLocationReviews({ page: reviewPage }) : Promise.resolve(null),
      ])
      setData(attendance)
      if (reviews) setReviewQueue(reviews)
    }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [page, reviewPage, canSeeTeam])
  useEffect(() => { load() }, [load])

  async function markAttendance(action) {
    setBusy(true); setError(''); setNotice('')
    try {
      let result
      if (action === 'in') {
        let position
        try { position = await requestCurrentLocation() }
        catch (locationError) { setGpsUnavailableReason(locationError.message); throw locationError }
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, clientReportedAt: new Date(position.timestamp).toISOString() }
        result = await checkIn(location)
      } else {
        result = await checkOut()
      }
      setNotice(result.message)
      setGpsUnavailableReason('')
      setSelectedLocation(null)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function checkInWithLocationException() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await checkIn(null, manualCheckInReason)
      setManualCheckInReason('')
      setGpsUnavailableReason('')
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function submitLocationCorrection(recordId = correctionRecordId || data.today?._id) {
    if (!recordId) return
    setLocationBusy(true); setError(''); setNotice('')
    try {
      const position = await requestCurrentLocation()
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, clientReportedAt: new Date(position.timestamp).toISOString() }
      const result = await requestAttendanceLocationCorrection(recordId, location, correctionReason)
      setCorrectionReason('')
      setCorrectionRecordId('')
      setNotice(result.message)
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setLocationBusy(false) }
  }

  async function reviewTeamLocation(recordId) {
    const message = window.prompt('Add a short note about this GPS review:')
    if (!message?.trim()) return
    try {
      await reviewAttendanceLocation(recordId, 'reviewed', message.trim())
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function reviewTeamCorrection(recordId, decision) {
    const message = window.prompt('Add a short correction review note:')
    if (!message?.trim()) return
    try {
      await reviewAttendanceLocation(recordId, decision, message.trim())
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  const savedLocation = data.today?.checkInLocation
  const currentLocation = selectedLocation || (savedLocation ? { location: savedLocation, heading: 'Today - s check-in location' } : null)

  return <section className="main-panel"><main className="dashboard-content work-page-content">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Attendance</h1><p>Record your workday and review attendance activity. GPS is a location signal and may be inaccurate; flagged readings are sent for human review.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
    <section className="panel-card attendance-today"><div><span className="eyebrow">TODAY  -  {dateLabel(data.dateKey)}</span><h2>{!data.today ? 'Not checked in yet' : data.today.checkOut ? 'Workday complete' : 'You are checked in'}</h2><p>{data.today ? `Check in ${timeLabel(data.today.checkIn)}  -  Check out ${timeLabel(data.today.checkOut)}` : 'Check in when you start work. Your browser will ask to share your current location.'}</p></div>
      <div className="attendance-actions"><button className="button button-primary" type="button" onClick={() => markAttendance('in')} disabled={busy || loading || Boolean(data.today)}>{busy ? 'Getting location - ' : 'Check in'}</button><button className="button button-secondary" type="button" onClick={() => markAttendance('out')} disabled={busy || loading || !data.today || Boolean(data.today?.checkOut)}>Check out</button></div>
    </section>
    {gpsUnavailableReason && !data.today && <section className="panel-card attendance-correction-card"><h2>Check in without GPS</h2><p>Attendance will still be recorded. A manager, HR, or admin will review the location exception; it is not treated as misconduct automatically.</p><p className="form-message">{gpsUnavailableReason}</p><label className="field-label">Explain why GPS is unavailable<textarea value={manualCheckInReason} onChange={(event) => setManualCheckInReason(event.target.value)} maxLength={1000} rows={3} /></label><button className="button button-secondary" type="button" onClick={checkInWithLocationException} disabled={busy || manualCheckInReason.trim().length < 3}>{busy ? 'Recording attendance - ' : 'Record check-in for review'}</button></section>}
    {data.today?.locationReviewStatus === 'pending' && <p className="form-message" role="status">Your GPS reading needs a human review{data.today.locationFlags?.length ? `: ${describeLocationFlags(data.today.locationFlags)}` : ''}. This flag does not change your attendance status. If the reading is incorrect, submit a correction request below.</p>}
    {data.today?.locationCorrection && <p className="form-message" role="status">Location correction status: {data.today.locationCorrection.status}{data.today.locationCorrection.reviewMessage ? ` - ${data.today.locationCorrection.reviewMessage}` : ''}</p>}
    {(data.today?.checkInLocation || data.today?.locationFlags?.includes('gps-unavailable')) && data.today.locationCorrection?.status !== 'pending' && <section className="panel-card attendance-correction-card"><h2>Request a location correction</h2><p>Your original GPS reading stays on the record for review. A manager, HR, or admin must approve any replacement.</p><label className="field-label">Why does this reading need correction?<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={1000} rows={3} /></label><button className="button button-secondary" type="button" onClick={() => submitLocationCorrection(data.today._id)} disabled={locationBusy || !correctionReason.trim() || loading}>{locationBusy ? 'Submitting - ' : 'Capture location and request review'}</button></section>}
    <section className="panel-card work-list-card"><div className="section-heading"><div><h2>{canSeeTeam ? 'Today - s team attendance' : 'My attendance'}</h2><p>{canSeeTeam ? 'Visible team records based on your role.' : 'Your recorded attendance.'}</p></div><button className="text-button" type="button" onClick={load}>Refresh</button></div>
      {loading ? <p className="user-table-state">Loading attendance - </p> : !data.records?.length ? <p className="user-table-state">No attendance records to show.</p> : <div className="attendance-table-wrap"><table className="work-table"><thead><tr>{canSeeTeam && <th>Team member</th>}<th>Date</th><th>Location</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead><tbody>{data.records.map((record) => <tr key={record._id}>{canSeeTeam && <td><strong>{record.user?.name}</strong><small>{record.user?.email}</small></td>}<td>{dateLabel(record.dateKey)}</td><td>{record.checkInLocation ? <><button className="text-button attendance-map-button" type="button" onClick={() => setSelectedLocation({ location: record.checkInLocation, heading: `${record.user?.name || 'My'}  -  ${dateLabel(record.dateKey)} recorded location` })}>Show map</button>{record.locationCorrection?.status === 'approved' && <button className="text-button" type="button" onClick={() => setSelectedLocation({ location: record.locationCorrection.location, heading: `${record.user?.name || 'My'}  -  approved correction evidence captured ${timeLabel(record.locationCorrection.location.recordedAt)}` })}>View approved correction evidence</button>}{record.locationFlags?.length > 0 && <small>{record.locationReviewStatus === 'pending' ? `Needs review: ${describeLocationFlags(record.locationFlags)}` : 'Reviewed'}{canSeeTeam && record.locationReviewStatus === 'pending' ? <button className="text-button" type="button" onClick={() => reviewTeamLocation(record._id)}>Mark reviewed</button> : null}</small>}{record.locationCorrection?.status === 'pending' && <><small>Correction requested: {record.locationCorrection.reason}</small>{canSeeTeam && <><button className="text-button" type="button" onClick={() => reviewTeamCorrection(record._id, 'approve-correction')}>Approve correction</button><button className="text-button" type="button" onClick={() => reviewTeamCorrection(record._id, 'reject-correction')}>Reject correction</button></>}</>}{record._id !== data.today?._id && (!canSeeTeam || String(record.user?._id) === String(user._id)) && record.locationCorrection?.status !== 'pending' && <button className="text-button" type="button" onClick={() => { setCorrectionRecordId(record._id); setCorrectionReason('') }}>Request correction</button>}</> : record.locationCorrection?.status === 'approved' ? <><small>No GPS was recorded at check-in. An approved correction was submitted later.</small><button className="text-button" type="button" onClick={() => setSelectedLocation({ location: record.locationCorrection.location, heading: `${record.user?.name || 'My'}  -  approved correction evidence captured ${timeLabel(record.locationCorrection.location.recordedAt)}` })}>View approved correction evidence</button></> : record.locationReviewStatus === 'pending' ? <><small>GPS unavailable: {record.locationExceptionReason || 'No location reading was recorded.'}</small>{canSeeTeam && <button className="text-button" type="button" onClick={() => reviewTeamLocation(record._id)}>Mark reviewed</button>}{record.locationCorrection?.status === 'pending' && <><small>Correction requested: {record.locationCorrection.reason}</small>{canSeeTeam && <><button className="text-button" type="button" onClick={() => reviewTeamCorrection(record._id, 'approve-correction')}>Approve correction</button><button className="text-button" type="button" onClick={() => reviewTeamCorrection(record._id, 'reject-correction')}>Reject correction</button></>}</>}{(!canSeeTeam || String(record.user?._id) === String(user._id)) && record.locationCorrection?.status !== 'pending' && <button className="text-button" type="button" onClick={() => { setCorrectionRecordId(record._id); setCorrectionReason('') }}>Request correction</button>}</> : 'Not recorded'}</td><td>{timeLabel(record.checkIn)}</td><td>{timeLabel(record.checkOut)}</td><td><span className={`task-status ${record.checkOut ? 'status-completed' : 'status-in-progress'}`}>{record.checkOut ? 'Complete' : 'In progress'}</span></td></tr>)}</tbody></table></div>}
      {correctionRecordId && <section className="panel-card attendance-correction-card"><h2>Request a location correction for {dateLabel(data.records.find((record) => record._id === correctionRecordId)?.dateKey)}</h2><p>The original GPS reading will remain available to the reviewer. A manager, HR, or admin must review any replacement.</p><label className="field-label">Why does this reading need correction?<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={1000} rows={3} /></label><div className="attendance-actions"><button className="button button-secondary" type="button" onClick={() => submitLocationCorrection(correctionRecordId)} disabled={locationBusy || !correctionReason.trim() || loading}>{locationBusy ? 'Submitting - ' : 'Capture location and request review'}</button><button className="text-button" type="button" onClick={() => setCorrectionRecordId('')}>Cancel</button></div></section>}
    {canSeeTeam && <section className="panel-card work-list-card"><div className="section-heading"><div><h2>Location review queue</h2><p>GPS exceptions and correction requests for your review scope.</p></div><button className="text-button" type="button" onClick={load} disabled={loading}>Refresh</button></div>{!reviewQueue.records.length ? <p className="user-table-state">No location reviews are waiting.</p> : <div className="attendance-table-wrap"><table className="work-table"><thead><tr><th>Employee</th><th>Attendance date</th><th>Review details</th><th>Evidence</th><th>Actions</th></tr></thead><tbody>{reviewQueue.records.map((record) => <tr key={record._id}><td><strong>{record.user?.name}</strong><small>{record.user?.email}</small></td><td>{dateLabel(record.dateKey)}</td><td>{record.locationFlags?.length ? describeLocationFlags(record.locationFlags) : 'Location exception'}{record.locationExceptionReason && <small>Employee note: {record.locationExceptionReason}</small>}{record.locationCorrection?.status === 'pending' && <small>Correction request: {record.locationCorrection.reason}</small>}</td><td>{record.checkInLocation && <button className="text-button" type="button" onClick={() => setSelectedLocation({ location: record.checkInLocation, heading: `${record.user?.name}  -  ${dateLabel(record.dateKey)} original reading` })}>Original location</button>}{record.locationCorrection?.status === 'pending' && <button className="text-button" type="button" onClick={() => setSelectedLocation({ location: record.locationCorrection.location, heading: `${record.user?.name}  -  correction submitted ${timeLabel(record.locationCorrection.location.recordedAt)}` })}>Correction evidence</button>}</td><td>{record.locationCorrection?.status === 'pending' ? <><button className="text-button" type="button" onClick={() => reviewTeamCorrection(record._id, 'approve-correction')}>Approve correction</button><button className="text-button" type="button" onClick={() => reviewTeamCorrection(record._id, 'reject-correction')}>Reject correction</button></> : <button className="text-button" type="button" onClick={() => reviewTeamLocation(record._id)}>Mark reviewed</button>}</td></tr>)}</tbody></table></div>}<Pagination pagination={reviewQueue.pagination} onPageChange={setReviewPage} disabled={loading} /></section>}
      <Pagination pagination={data.pagination} onPageChange={setPage} disabled={loading} />
    </section>
    {currentLocation && <LocationMap location={currentLocation.location} heading={currentLocation.heading} />}
  </main><Footer /></section>
}

/** Chooses the administrator report or personal attendance screen based on the role. */
export default function AttendancePage({ user }) {
  return user.role === 'admin' ? <AdminMonthlyAttendance /> : <PersonalAttendance user={user} />
}


