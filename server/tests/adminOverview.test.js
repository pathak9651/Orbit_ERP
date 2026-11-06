import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDepartmentAttendanceSnapshot } from '../controllers/adminOverviewController.js'

const paginationOptions = { page: 1, pageSize: 10 }

test('department attendance counts active people as present, absent, or on approved leave', () => {
  const departments = [{ _id: 'dept-a', name: 'Accounts' }, { _id: 'dept-b', name: 'People' }]
  const people = [
    { _id: 'user-present', role: 'employee', isVerified: true, department: 'dept-a' },
    { _id: 'user-absent', role: 'employee', isVerified: true, department: 'dept-a' },
    { _id: 'user-leave', role: 'manager', isVerified: true, department: 'dept-b' },
    { _id: 'user-pending', role: 'employee', isVerified: false, department: 'dept-b' },
    { _id: 'user-admin', role: 'admin', isVerified: true, department: 'dept-b' },
  ]

  const result = buildDepartmentAttendanceSnapshot({
    people,
    departments,
    attendanceRecords: [{ user: 'user-present', dateKey: '2026-11-03' }, { user: 'user-present', dateKey: '2026-11-02' }],
    approvedLeaves: [{ requester: 'user-leave', startDate: '2026-11-03', endDate: '2026-11-05' }],
    dateKey: '2026-11-03',
    paginationOptions,
  })

  assert.deepEqual(result.departments, [
    { id: 'dept-a', name: 'Accounts', employees: 2, present: 1, absent: 1, onLeave: 0 },
    { id: 'dept-b', name: 'People', employees: 1, present: 0, absent: 0, onLeave: 1 },
  ])
})

test('department attendance keeps unassigned employees visible and paginates departments on the server', () => {
  const result = buildDepartmentAttendanceSnapshot({
    people: [
      { _id: 'user-unassigned', role: 'employee', isVerified: true, department: null },
      { _id: 'user-a', role: 'employee', isVerified: true, department: 'dept-a' },
      { _id: 'user-b', role: 'employee', isVerified: true, department: 'dept-b' },
    ],
    departments: [{ _id: 'dept-a', name: 'Accounts' }, { _id: 'dept-b', name: 'People' }],
    attendanceRecords: [],
    approvedLeaves: [],
    dateKey: '2026-11-03',
    paginationOptions: { page: 2, pageSize: 2 },
  })

  assert.deepEqual(result.departments.map(({ name }) => name), ['Unassigned'])
  assert.deepEqual(result.pagination, {
    page: 2, pageSize: 2, totalItems: 3, totalPages: 2, hasNextPage: false, hasPreviousPage: true,
  })
  assert.equal(result.departments[0].absent, 1)
})
