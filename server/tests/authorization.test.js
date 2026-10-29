import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTHORIZATION_POLICIES, BUILT_IN_ROLE_PERMISSIONS, canScheduleCalendarType, hasPermission } from '../configs/authorization.js'

test('authorization catalog describes grants by built-in role', () => {
  for (const [role, permissions] of Object.entries(BUILT_IN_ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      assert.ok(AUTHORIZATION_POLICIES[permission], `${role} references unknown policy ${permission}`)
      assert.equal(hasPermission({ role }, permission), true, `${role} should have ${permission}`)
    }
  }
})

test('privileged permissions are denied to ordinary and custom roles by default', () => {
  assert.equal(hasPermission({ role: 'employee' }, 'admin.manage'), false)
  assert.equal(hasPermission({ role: 'custom-auditor' }, 'documents.download'), false)
  assert.equal(hasPermission({ role: 'accountant' }, 'documents.download'), false)
  assert.equal(hasPermission(null, 'workspace.read'), false)
})

test('billing access allows the accountant role or an account department', () => {
  assert.equal(hasPermission({ role: 'accountant' }, 'billing.manage'), true)
  assert.equal(hasPermission({ role: 'employee', department: { name: 'Accounts' } }, 'billing.manage'), true)
  assert.equal(hasPermission({ role: 'employee', department: { name: 'Sales' } }, 'billing.manage'), false)
})

test('calendar scheduling limits HR to meetings while admins can schedule all types', () => {
  assert.equal(canScheduleCalendarType({ role: 'hr' }, 'meeting'), true)
  assert.equal(canScheduleCalendarType({ role: 'hr' }, 'holiday'), false)
  assert.equal(canScheduleCalendarType({ role: 'admin' }, 'holiday'), true)
  assert.equal(canScheduleCalendarType({ role: 'employee' }, 'meeting'), false)
})
