import PDFDocument from 'pdfkit'

/** Collects optional company contact and tax details for the invoice heading. */
function companyInfo() {
  return [
    process.env.ORGANIZATION_ADDRESS,
    process.env.ORGANIZATION_PHONE && `Phone: ${process.env.ORGANIZATION_PHONE}`,
    process.env.ORGANIZATION_EMAIL && `Email: ${process.env.ORGANIZATION_EMAIL}`,
    process.env.ORGANIZATION_WEBSITE,
    process.env.ORGANIZATION_TAX_ID && `Tax ID: ${process.env.ORGANIZATION_TAX_ID}`,
  ].filter(Boolean)
}

/** Draws the compact Orbit mark used on each invoice page. */
function drawLogo(doc, x = 48, y = 38) {
  doc.roundedRect(x, y, 42, 42, 9).fill('#83dfbd')
  doc.fillColor('#0c1814').font('Helvetica-Bold').fontSize(26).text('o', x + 11, y + 5, { width: 24, align: 'center' })
}

/** Draws consistent item-column labels and returns the first row position. */
function drawTableHeader(doc, y) {
  doc.save().roundedRect(48, y, 499, 25, 5).fill('#edf5f1').restore()
  doc.fillColor('#34443d').font('Helvetica-Bold').fontSize(8)
  doc.text('DESCRIPTION', 58, y + 8, { width: 270 })
  doc.text('QTY', 352, y + 8, { width: 38, align: 'right' })
  doc.text('UNIT PRICE', 397, y + 8, { width: 72, align: 'right' })
  doc.text('AMOUNT', 474, y + 8, { width: 63, align: 'right' })
  return y + 25
}

/** Formats invoice amounts as Indian rupees with two decimal places. */
function formatMoney(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Formats invoice dates in a stable UTC calendar timezone. */
function formatInvoiceDate(value) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}

/** Adds a visual system-generated mark to make the PDF's origin clear. */
function drawDigitalStamp(doc, x, y) {
  doc.save().lineWidth(1.2).strokeColor('#258568').roundedRect(x, y, 112, 42, 6).stroke().restore()
  doc.fillColor('#258568').font('Helvetica-Bold').fontSize(8).text('ORBIT ERP', x + 7, y + 8, { width: 98, align: 'center' })
  doc.font('Helvetica').fontSize(7).text('SYSTEM GENERATED', x + 7, y + 21, { width: 98, align: 'center' })
}

/** Renders a paginated customer invoice into a PDF buffer for download or email. */
export function createInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const companyName = (process.env.ORGANIZATION_NAME || 'Orbit ERP').trim()
    const details = companyInfo()
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: companyName, Subject: `Invoice for ${invoice.customerName}` } })
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawLogo(doc)
    doc.fillColor('#16221d').font('Helvetica-Bold').fontSize(17).text(companyName, 100, 40, { width: 295 })
    doc.fillColor('#68756f').font('Helvetica').fontSize(7.5)
    let companyY = 63
    for (const line of details) {
      doc.text(line, 100, companyY, { width: 295, height: 20, ellipsis: true })
      companyY += 11
    }
    doc.fillColor('#16221d').font('Helvetica-Bold').fontSize(22).text('INVOICE', 405, 42, { width: 142, align: 'right' })
    doc.fillColor('#68756f').font('Helvetica').fontSize(9).text(invoice.invoiceNumber, 405, 70, { width: 142, align: 'right' })
    doc.fillColor(invoice.status === 'paid' ? '#258568' : '#46564e').font('Helvetica-Bold').fontSize(8).text(String(invoice.status).toUpperCase(), 405, 86, { width: 142, align: 'right' })
    doc.moveTo(48, 120).lineTo(547, 120).lineWidth(1).strokeColor('#dbe4df').stroke()

    doc.fillColor('#68756f').font('Helvetica-Bold').fontSize(8).text('BILL TO', 50, 143)
    doc.fillColor('#16221d').font('Helvetica-Bold').fontSize(12).text(invoice.customerName, 50, 158, { width: 250 })
    if (invoice.customerEmail) doc.fillColor('#68756f').font('Helvetica').fontSize(9).text(invoice.customerEmail, 50, 176, { width: 250 })
    doc.fillColor('#68756f').font('Helvetica').fontSize(9)
    doc.text(`Invoice date: ${formatInvoiceDate(invoice.createdAt || Date.now())}`, 330, 145, { width: 215, align: 'right' })
    doc.text(`Due date: ${formatInvoiceDate(invoice.dueDate)}`, 330, 161, { width: 215, align: 'right' })
    if (process.env.ORGANIZATION_TAX_ID) doc.text(`Company tax ID: ${process.env.ORGANIZATION_TAX_ID}`, 330, 177, { width: 215, align: 'right' })

    let y = drawTableHeader(doc, 215)
    for (const item of invoice.items) {
      const descriptionHeight = doc.font('Helvetica').fontSize(9).heightOfString(item.description, { width: 270 })
      const rowHeight = Math.max(30, descriptionHeight + 14)
      if (y + rowHeight > 700) {
        doc.addPage()
        drawLogo(doc, 48, 32)
        doc.fillColor('#16221d').font('Helvetica-Bold').fontSize(13).text(`${invoice.invoiceNumber} - continued`, 100, 44)
        y = drawTableHeader(doc, 95)
      }
      doc.fillColor('#27352e').font('Helvetica').fontSize(9).text(item.description, 58, y + 9, { width: 270 })
      doc.text(String(item.quantity), 352, y + 9, { width: 38, align: 'right' })
      doc.text(formatMoney(item.unitPrice), 397, y + 9, { width: 72, align: 'right' })
      doc.font('Helvetica-Bold').text(formatMoney(item.lineTotal), 474, y + 9, { width: 63, align: 'right' })
      y += rowHeight
      doc.moveTo(48, y).lineTo(547, y).lineWidth(0.5).strokeColor('#e7ede9').stroke()
    }

    const summarySpace = invoice.notes ? 145 : 90
    if (y + 22 + summarySpace > 780) {
      doc.addPage()
      drawLogo(doc, 48, 32)
      doc.fillColor('#16221d').font('Helvetica-Bold').fontSize(13).text(`${invoice.invoiceNumber} - summary`, 100, 44)
      y = 100
    }
    const totalY = y + 22
    doc.fillColor('#68756f').font('Helvetica').fontSize(10).text('Total due', 350, totalY, { width: 100, align: 'right' })
    doc.fillColor('#16221d').font('Helvetica-Bold').fontSize(15).text(formatMoney(invoice.total), 455, totalY - 3, { width: 90, align: 'right' })
    if (invoice.notes) {
      doc.fillColor('#68756f').font('Helvetica-Bold').fontSize(8).text('NOTES', 50, totalY + 42)
      doc.fillColor('#46564e').font('Helvetica').fontSize(9).text(invoice.notes, 50, totalY + 56, { width: 300 })
    }
    drawDigitalStamp(doc, 420, Math.min(totalY + 48, 755))
    doc.fillColor('#87938d').font('Helvetica').fontSize(8).text('Thank you for your business.', 50, 762, { width: 300 })

    const pages = doc.bufferedPageRange()
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(pages.start + index)
      doc.moveTo(48, 790).lineTo(547, 790).lineWidth(0.5).strokeColor('#dbe4df').stroke()
      doc.fillColor('#87938d').font('Helvetica').fontSize(7).text(companyName, 48, 801, { width: 300 })
      doc.text(`Page ${index + 1} of ${pages.count}`, 450, 801, { width: 97, align: 'right' })
    }
    doc.end()
  })
}
