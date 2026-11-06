import test from 'node:test'
import assert from 'node:assert/strict'
import { isLeaveCoverageEligible } from '../controllers/taskController.js'

const request = {
  requester: '64b000000000000000000001', status: 'approved', startDate: '2026-11-10', endDate: '2026-11-14',
}

test('coverage requires approved leave for the selected employee on the task due date', () => {
  assert.equal(isLeaveCoverageEligible(request, request.requester, '2026-11-10'), true)
  assert.equal(isLeaveCoverageEligible(request, request.requester, '2026-11-14'), true)
  assert.equal(isLeaveCoverageEligible(request, request.requester, '2026-11-15'), false)
  assert.equal(isLeaveCoverageEligible({ ...request, status: 'pending' }, request.requester, '2026-11-12'), false)
  assert.equal(isLeaveCoverageEligible(request, '64b000000000000000000002', '2026-11-12'), false)
})
