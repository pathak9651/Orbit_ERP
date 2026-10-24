/** Renders shared server-driven paging controls and a result range summary. */
export default function Pagination({ pagination, onPageChange, disabled = false }) {
  if (!pagination || pagination.totalPages <= 1) return null

  const firstItem = (pagination.page - 1) * pagination.pageSize + 1
  const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems)

  return (
    <nav className="pagination-controls" aria-label="Pagination">
      <span className="pagination-summary">Showing {firstItem}-{lastItem} of {pagination.totalItems}</span>
      <div className="pagination-buttons">
        <button className="button button-secondary" type="button" disabled={disabled || !pagination.hasPreviousPage} onClick={() => onPageChange(pagination.page - 1)}>
          Previous
        </button>
        <span className="pagination-current-page">Page {pagination.page} of {pagination.totalPages}</span>
        <button className="button button-secondary" type="button" disabled={disabled || !pagination.hasNextPage} onClick={() => onPageChange(pagination.page + 1)}>
          Next
        </button>
      </div>
    </nav>
  )
}
