import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import app from '../app.js'
import { attachChatWebSocket } from '../services/chatRealtime.js'

let server
let baseUrl

before(async () => {
  server = createServer(app)
  attachChatWebSocket(server)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
    server.listen(0, '127.0.0.1')
  })
  baseUrl = `ws://127.0.0.1:${server.address().port}/api/chat/ws`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

/** Waits for the HTTP rejection that a WebSocket server returns before the upgrade. */
function rejectedHandshake(origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(baseUrl, { headers: { Origin: origin } })
    socket.once('unexpected-response', (_request, response) => {
      response.resume()
      resolve(response.statusCode)
    })
    socket.once('open', () => { socket.close(); reject(new Error('The unauthenticated socket unexpectedly connected.')) })
    socket.once('error', (error) => {
      if (!socket.listenerCount('unexpected-response')) reject(error)
    })
  })
}

test('chat WebSocket rejects origins outside the frontend allowlist', async () => {
  assert.equal(await rejectedHandshake('https://attacker.example'), 403)
})

test('chat WebSocket requires the signed-in session cookie', async () => {
  assert.equal(await rejectedHandshake('http://localhost:5173'), 401)
})
