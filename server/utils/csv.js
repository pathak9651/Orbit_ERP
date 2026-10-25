/** Escapes one CSV cell and neutralizes spreadsheet formula prefixes. */
export function escapeCsvCell(value) {
  const text = value == null ? '' : String(value)
  const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

/** Serializes one row with RFC-style quoted cells and CRLF line endings. */
export function serializeCsvRow(values) {
  return values.map(escapeCsvCell).join(',') + '\r\n'
}
