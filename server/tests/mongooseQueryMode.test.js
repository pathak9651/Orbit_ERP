import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

function queryModeFor(nodeEnvironment) {
  const script = "import mongoose from 'mongoose'; import { configureMongooseQueryMode } from './configs/db.js'; configureMongooseQueryMode(); process.stdout.write(String(mongoose.get('strictQuery')));"
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: nodeEnvironment },
    encoding: 'utf8',
  })
}

test('Mongoose throws on unknown query paths outside production', () => {
  assert.equal(queryModeFor('development'), 'throw')
  assert.equal(queryModeFor('test'), 'throw')
})

test('Mongoose keeps unknown query paths in production filters', () => {
  assert.equal(queryModeFor('production'), 'false')
})
