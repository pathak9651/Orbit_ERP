import { useCallback, useEffect, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import Footer from '../layout/Footer.jsx'
import LoadingState from '../common/LoadingState.jsx'
import Pagination from '../common/Pagination.jsx'
import { downloadDocumentFile, getDocuments, uploadDocument, viewDocumentFile } from '../../services/api.js'
import { validateDocumentFile } from '../../services/validation.js'

const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const formatDate = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

/** Gives every signed-in role read-only access to company files and administrators upload access. */
export default function DocumentsPage({ user }) {
  const [documents, setDocuments] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [downloadingId, setDownloadingId] = useState('')
  const [readingId, setReadingId] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadDocuments = useCallback(async () => {
    setError('')
    try {
      const result = await getDocuments({ page })
      setDocuments(result.documents || [])
      setPagination(result.pagination)
    } catch (requestError) {
      setError(requestError.message || 'Could not load the document library.')
    } finally { setLoading(false) }
  }, [page])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
  }, [preview])

  async function handleUpload(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const file = fields.get('documentFile')
    const validationMessage = await validateDocumentFile(file)
    if (validationMessage) { setError(validationMessage); return }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await uploadDocument(file, String(fields.get('description') || ''))
      form.reset()
      setNotice(result.message || 'Document uploaded.')
      if (page !== 1) setPage(1)
      else await loadDocuments()
    } catch (requestError) {
      setError(requestError.message || 'Could not upload this document.')
    } finally { setBusy(false) }
  }

  async function handleDownload(documentRecord) {
    setDownloadingId(documentRecord.id)
    setError('')
    try { await downloadDocumentFile(documentRecord) }
    catch (requestError) { setError(requestError.message || 'Could not download this document.') }
    finally { setDownloadingId('') }
  }

  async function handleRead(documentRecord) {
    setReadingId(documentRecord.id)
    setError('')
    try {
      const file = await viewDocumentFile(documentRecord)
      if (documentRecord.contentType === 'application/pdf') {
        setPreview({ title: documentRecord.title, type: 'pdf', url: URL.createObjectURL(file) })
      } else if (documentRecord.contentType === 'text/plain') {
        setPreview({ title: documentRecord.title, type: 'text', text: await file.text() })
      } else if (documentRecord.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        const spreadsheet = new File([file], documentRecord.originalName, { type: documentRecord.contentType })
        setPreview({ title: documentRecord.title, type: 'spreadsheet', rows: await readSheet(spreadsheet) })
      }
    } catch (requestError) {
      setError(requestError.message || 'Could not open this document.')
    } finally { setReadingId('') }
  }

  function closePreview() {
    setPreview(null)
  }

  return <section className="main-panel"><main className="dashboard-content work-page-content">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Company documents</h1><p>Read shared PDFs, text files, and XLSX spreadsheets. Only administrators can download files.</p></div></div>
    {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}

    {user.role === 'admin' && <section className="panel-card work-form-card">
      <div className="section-heading"><div><h2>Upload a document</h2><p>Files are private to signed-in Orbit users. Maximum file size: 15 MB.</p></div></div>
      <form className="document-upload-form" onSubmit={handleUpload}>
        <label className="field-label">Document file<input name="documentFile" type="file" accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" required disabled={busy} /></label>
        <label className="field-label">Description <span className="work-muted">(optional)</span><textarea name="description" rows="2" maxLength="500" placeholder="What is this document for?" disabled={busy} /></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload document'}</button>
      </form>
    </section>}

    <section className="panel-card work-list-card">
      <div className="section-heading"><div><h2>Shared documents</h2><p>{pagination?.totalItems ?? documents.length} documents available to your account</p></div><button className="text-button" type="button" onClick={loadDocuments} disabled={loading}>Refresh</button></div>
      {loading ? <LoadingState label="Loading documents" /> : documents.length === 0 ? <p className="user-table-state">No documents have been shared yet.</p> : <div className="document-list">{documents.map((documentRecord) => <article className="document-item" key={documentRecord.id}>
        <div className="document-item-icon" aria-hidden="true">{documentRecord.originalName.split('.').at(-1)?.toUpperCase() || 'FILE'}</div>
        <div className="document-item-details"><h3>{documentRecord.title}</h3><p>{documentRecord.originalName}</p>{documentRecord.description && <p className="document-description">{documentRecord.description}</p>}<div className="work-meta"><span>{formatBytes(documentRecord.size)}</span><span>Added by {documentRecord.uploadedBy?.name || 'Administrator'}</span><span>{formatDate(documentRecord.createdAt)}</span></div></div>
        <div className="document-actions">
          {['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(documentRecord.contentType)
            ? <button className="button button-secondary" type="button" onClick={() => handleRead(documentRecord)} disabled={Boolean(readingId)}>{readingId === documentRecord.id ? 'Opening…' : 'Read'}</button>
            : user.role !== 'admin' && <span className="document-preview-note" title="Ask an administrator for a PDF copy">Preview unavailable</span>}
          {user.role === 'admin' && <button className="button button-secondary document-download-button" type="button" onClick={() => handleDownload(documentRecord)} disabled={Boolean(downloadingId)}>{downloadingId === documentRecord.id ? 'Downloading…' : 'Download'}</button>}
        </div>
      </article>)}</div>}
      <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} />
    </section>
    {preview && <div className="document-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview() }}>
      <section className="document-viewer" role="dialog" aria-modal="true" aria-label={`Reading ${preview.title}`}>
        <header className="document-viewer-header"><h2>{preview.title}</h2><button className="button button-secondary" type="button" onClick={closePreview}>Close</button></header>
        {preview.type === 'pdf'
          ? <iframe className="document-pdf-frame" src={`${preview.url}#toolbar=0&navpanes=0`} title={`Document preview: ${preview.title}`} />
          : preview.type === 'text'
            ? <pre className="document-text-preview">{preview.text}</pre>
            : <div className="document-spreadsheet-preview"><table><tbody>{preview.rows.slice(0, 250).map((row, rowIndex) => <tr key={rowIndex}>{row.slice(0, 30).map((cell, cellIndex) => <td key={cellIndex}>{cell == null ? '' : String(cell)}</td>)}</tr>)}</tbody></table>{preview.rows.length > 250 && <p>Showing the first 250 rows.</p>}</div>}
      </section>
    </div>}
  </main><Footer /></section>
}
