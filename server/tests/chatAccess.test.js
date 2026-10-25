import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessDepartmentRoom, canUsersChat } from '../services/chatAccess.js'

const departmentA = '64b000000000000000000001'
const departmentB = '64b000000000000000000002'
const user = (id, role, department) => ({ _id: id, role, department })

test('admin can direct message any other account, including across departments', async () => {
  assert.equal(canUsersChat(user('admin', 'admin'), user('employee', 'employee', departmentB)), true)
})

test('HR can communicate across departments and employees can chat within their department', async () => {
  assert.equal(canUsersChat(user('hr', 'hr'), user('employee', 'employee', departmentB)), true)
  assert.equal(canUsersChat(user('employee-a', 'employee', departmentA), user('employee-b', 'employee', departmentA)), true)
})

test('department staff cannot directly message an unrelated staff member', async () => {
  assert.equal(canUsersChat(user('employee-a', 'employee', departmentA), user('employee-b', 'employee', departmentB)), false)
})

test('users cannot open another department room while administrators can', () => {
  assert.equal(canAccessDepartmentRoom(user('employee', 'employee', departmentA), departmentA), true)
  assert.equal(canAccessDepartmentRoom(user('employee', 'employee', departmentA), departmentB), false)
  assert.equal(canAccessDepartmentRoom(user('admin', 'admin', departmentA), departmentB), true)
})

test('a user cannot open a direct chat with themselves', async () => {
  assert.equal(canUsersChat(user('same', 'admin'), user('same', 'employee')), false)
})
