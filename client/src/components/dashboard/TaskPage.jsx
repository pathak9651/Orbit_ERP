import { useCallback, useEffect, useState } from 'react'
import Footer from '../layout/Footer.jsx'
import { createTask, getTaskAssignees, getTasks, updateTaskStatus } from '../../services/api.js'

const statusLabels = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed' }
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'No due date'

export default function TaskPage({ user }) {
  const [tasks, setTasks] = useState([])
  const [assignees, setAssignees] = useState([])
  const [form, setForm] = useState({ title: '', description: '', assignedTo: '', dueDate: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canAssign = ['admin', 'hr', 'manager'].includes(user.role)

  const load = useCallback(async () => {
    setError('')
    try {
      const [taskResult, peopleResult] = await Promise.all([getTasks(), canAssign ? getTaskAssignees() : Promise.resolve({ users: [] })])
      setTasks(taskResult.tasks || [])
      setAssignees(peopleResult.users || [])
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }, [canAssign])

  useEffect(() => { load() }, [load])

  async function submitTask(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await createTask(form)
      setForm({ title: '', description: '', assignedTo: '', dueDate: '' })
      setNotice('Task assigned successfully.')
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setBusy(false) }
  }

  async function setStatus(task, status) {
    setError(''); setNotice('')
    try {
      await updateTaskStatus(task._id, status)
      setNotice('Task status updated.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  return <section className="main-panel"><main className="dashboard-content work-page-content">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>{canAssign ? 'Task management' : 'My tasks'}</h1><p>Track assignments, due dates, and progress.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
    {canAssign && <section className="panel-card work-form-card"><div className="section-heading"><div><h2>Assign a task</h2><p>Assignments follow your role and department access.</p></div></div>
      <form className="work-form" onSubmit={submitTask}>
        <label className="field-label">Task title<input required minLength="3" maxLength="120" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" /></label>
        <label className="field-label">Assign to<select required value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Choose a team member</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.roleName}{person.department?.name ? ` · ${person.department.name}` : ''}</option>)}</select></label>
        <label className="field-label">Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        <label className="field-label work-description">Details<textarea rows="3" maxLength="2000" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Add instructions or context" /></label>
        <button className="button button-primary" type="submit" disabled={busy || !assignees.length}>{busy ? 'Assigning…' : 'Assign task'}</button>
        {!assignees.length && <p className="work-muted">No eligible verified team members are available to assign.</p>}
      </form>
    </section>}
    <section className="panel-card work-list-card"><div className="section-heading"><div><h2>{canAssign ? 'Tasks' : 'Assigned to me'}</h2><p>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</p></div><button className="text-button" type="button" onClick={load}>Refresh</button></div>
      {loading ? <p className="user-table-state">Loading tasks…</p> : tasks.length === 0 ? <p className="user-table-state">No tasks to show yet.</p> : <div className="work-list">{tasks.map((task) => <article className="work-item" key={task._id}>
        <div className="work-item-main"><div className="work-item-title"><h3>{task.title}</h3><span className={`task-status status-${task.status}`}>{statusLabels[task.status]}</span></div>
          {task.description && <p>{task.description}</p>}<div className="work-meta"><span>Assigned to {task.assignedTo?.name || 'Unknown'}</span><span>By {task.assignedBy?.name || 'Unknown'}</span><span>{task.department?.name || 'No department'}</span><span>Due {formatDate(task.dueDate)}</span></div></div>
        {(String(task.assignedTo?._id) === String(user.id) || String(task.assignedBy?._id) === String(user.id) || ['admin', 'hr'].includes(user.role)) && <label className="field-label task-status-select"><span className="sr-only">Update status</span><select value={task.status} onChange={(e) => setStatus(task, e.target.value)}><option value="pending">Pending</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label>}
      </article>)}</div>}
    </section>
  </main><Footer /></section>
}
