import test from 'node:test'
import assert from 'node:assert/strict'
import { getReportPeriod, isValidReportDate, supportedReportPeriods } from '../controllers/adminReportsController.js'

test('weekly report covers Monday through Sunday and groups by day', () => {
  const report = getReportPeriod('weekly', '2026-10-28', 'UTC')
  assert.equal(report.startDate, '2026-10-26')
  assert.equal(report.endDate, '2026-11-01')
  assert.equal(report.bucketUnit, 'day')
  assert.equal(report.bucketCount, 7)
})

test('monthly and quarterly reports use the correct calendar boundaries', () => {
  const month = getReportPeriod('monthly', '2026-02-10', 'UTC')
  const quarter = getReportPeriod('quarterly', '2026-05-10', 'UTC')
  assert.equal(month.startDate, '2026-02-01')
  assert.equal(month.endDate, '2026-02-28')
  assert.equal(month.bucketCount, 28)
  assert.equal(quarter.startDate, '2026-04-01')
  assert.equal(quarter.endDate, '2026-06-30')
  assert.equal(quarter.bucketUnit, 'month')
  assert.equal(quarter.bucketCount, 3)
})

test('yearly report covers the selected calendar year and unsupported periods fail', () => {
  const year = getReportPeriod('yearly', '2024-07-15', 'UTC')
  assert.equal(year.startDate, '2024-01-01')
  assert.equal(year.endDate, '2024-12-31')
  assert.equal(year.bucketCount, 12)
  assert.deepEqual([...supportedReportPeriods].sort(), ['quarterly', 'weekly', 'yearly', 'monthly'].sort())
  assert.throws(() => getReportPeriod('daily', '2024-07-15'), /choose weekly, monthly, quarterly, or yearly/i)
  assert.equal(isValidReportDate('2024-02-30'), false)
})
