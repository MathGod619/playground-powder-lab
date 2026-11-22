#!/usr/bin/env node
/**
 * Powder Rave online relay: rooms with 4-letter codes, nothing else.
 *
 * The host's game runs the world and streams it to the room; guests send their paint strokes, drops and
 * cursor to the host. This relay only forwards messages between the people in a room. It stores nothing,
 * runs no game code and has no dependencies (it speaks the WebSocket protocol itself).
 *
 *   RAVE_RELAY_PORT     port on 127.0.0.1 (default 4191)
 *   RAVE_RELAY_ORIGINS  comma-separated page origins allowed to connect
 *                       (default: the GitHub Pages site and any localhost / 127.0.0.1 dev server)
 *
 * Protocol (JSON text frames unless noted):
 *   client → relay   {t:'host', name} | {t:'join', code, name}
 *   relay → client   {t:'room', code, you, players} | {t:'players', players} | {t:'error', reason} | {t:'closed'}
 *   host → relay     any other text or binary frame: broadcast to every guest unchanged
 *   guest → relay    any other text frame: delivered to the host as {t:'from', id, m}
 */
import { createHash, randomInt } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
export const LIMITS = {
  players: 4,
  rooms: 60,
  /** Largest single message (a compressed world keyframe is well under this). */
  message: 1 << 20,
  /** Bytes a host may stream per second, averaged over a few seconds. */
  hostRate: 1.5 * (1 << 20),
  /** Text messages a guest may send per second. */
  guestRate: 120,
  idleMs: 90_000,
}
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const defaultOrigins = ['https://mathgod619.github.io']
export function originAllowed(origin, allowed = defaultOrigins) {
  if (!origin) return false
  if (allowed.includes(origin)) return true
  try {
    const { protocol, hostname } = new URL(origin)
    return (protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1')
  } catch { return false }
}

// ------------------------------------------------------------------ WebSocket framing

export function encodeFrame(payload, binary = false, opcode = binary ? 2 : 1) {
  const data = typeof payload === 'string' ? Buffer.from(payload) : Buffer.from(payload)
  const n = data.length
  const head = n < 126 ? Buffer.from([0x80 | opcode, n])
    : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h })()
  return Buffer.concat([head, data])
}

/** Pulls complete frames out of `buffer`. Returns the frames and whatever bytes are left over. */
export function decodeFrames(buffer, max = LIMITS.message) {
  const frames = []
  let offset = 0
  while (buffer.length - offset >= 2) {
    const b0 = buffer[offset], b1 = buffer[offset + 1]
    let length = b1 & 127, at = offset + 2
    if (length === 126) { if (buffer.length - at < 2) break; length = buffer.readUInt16BE(at); at += 2 }
    else if (length === 127) { if (buffer.length - at < 8) break; length = Number(buffer.readBigUInt64BE(at)); at += 8 }
    if (length > max) throw new Error('message too large')
    const masked = (b1 & 128) !== 0
    if (buffer.length - at < (masked ? 4 : 0) + length) break
    let data = buffer.subarray(at + (masked ? 4 : 0), at + (masked ? 4 : 0) + length)
    if (masked) {
      const mask = buffer.subarray(at, at + 4), out = Buffer.alloc(length)
      for (let i = 0; i < length; i++) out[i] = data[i] ^ mask[i & 3]
      data = out
    }
    frames.push({ fin: (b0 & 128) !== 0, opcode: b0 & 15, data })
    offset = at + (masked ? 4 : 0) + length
  }
  return { frames, rest: buffer.subarray(offset) }
}

// ------------------------------------------------------------------ rooms

export function createRelay({ origins = defaultOrigins, limits = LIMITS, log = () => {}, allowMissingOrigin = false } = {}) {
  const rooms = new Map()
  let nextId = 1

  const code = () => {
    for (let tries = 0; tries < 50; tries++) {
      const c = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('')
      if (!rooms.has(c)) return c
    }
    return null
  }
  const roster = room => [...room.members.values()].map(m => ({ id: m.id, name: m.name, host: m === room.host }))
  const cleanName = name => String(name ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 20) || 'Raver'

  function attach(socket) {
    const peer = { id: nextId++, name: 'Raver', room: null, socket, buffer: Buffer.alloc(0), parts: [], partOp: 0, budget: 0, last: Date.now(), alive: true }
    const send = (payload, binary = false) => { if (!socket.destroyed) socket.write(encodeFrame(payload, binary)) }
    const json = message => send(JSON.stringify(message))
    peer.send = send; peer.json = json

    const leave = () => {
      const room = peer.room
      if (!room) return
      peer.room = null
      room.members.delete(peer.id)
      if (room.host === peer) {
        for (const m of room.members.values()) { m.json({ t: 'closed' }); m.room = null }
        rooms.delete(room.code)
        log(`room ${room.code} closed`)
      } else {
        for (const m of room.members.values()) m.json({ t: 'players', players: roster(room) })
      }
    }
    const close = (status = 1000) => {
      if (!peer.alive) return
      peer.alive = false
      leave()
      try { socket.end(encodeFrame(Buffer.from([status >> 8, status & 255]), true, 8)) } catch { /* gone */ }
      setTimeout(() => socket.destroy(), 500).unref?.()
    }

    function control(message) {
      if (message.t === 'host' && !peer.room) {
        if (rooms.size >= limits.rooms) return json({ t: 'error', reason: 'The server is full. Try again in a bit.' })
        const c = code()
        if (!c) return json({ t: 'error', reason: 'Could not make a room code.' })
        peer.name = cleanName(message.name)
        const room = { code: c, host: peer, members: new Map([[peer.id, peer]]) }
        rooms.set(c, room)
        peer.room = room
        log(`room ${c} opened`)
        return json({ t: 'room', code: c, you: peer.id, players: roster(room) })
      }
      if (message.t === 'join' && !peer.room) {
        const room = rooms.get(String(message.code ?? '').toUpperCase().trim())
        if (!room) return json({ t: 'error', reason: 'No rave with that code. Check the letters.' })
        if (room.members.size >= limits.players) return json({ t: 'error', reason: 'That rave is full.' })
        peer.name = cleanName(message.name)
        room.members.set(peer.id, peer)
        peer.room = room
        json({ t: 'room', code: room.code, you: peer.id, players: roster(room) })
        for (const m of room.members.values()) if (m !== peer) m.json({ t: 'players', players: roster(room) })
        return
      }
      if (message.t === 'leave') return leave()
      return false
    }

    function deliver(opcode, data) {
      const room = peer.room
      if (opcode === 1) {
        let message
        try { message = JSON.parse(data.toString('utf8')) } catch { return close(1007) }
        if (control(message) !== false) return
        if (!room) return
        if (room.host === peer) {
          for (const m of room.members.values()) if (m !== peer) m.send(data)
        } else {
          if ((peer.budget += 1) > limits.guestRate * 3) return
          room.host.json({ t: 'from', id: peer.id, m: message })
        }
      } else if (opcode === 2 && room && room.host === peer) {
        if ((peer.budget += data.length) > limits.hostRate * 3) return
        for (const m of room.members.values()) if (m !== peer) m.send(data, true)
      }
    }

    socket.on('data', chunk => {
      peer.last = Date.now()
      peer.buffer = peer.buffer.length ? Buffer.concat([peer.buffer, chunk]) : chunk
      let decoded
      try { decoded = decodeFrames(peer.buffer, limits.message) } catch { return close(1009) }
      peer.buffer = Buffer.from(decoded.rest)
      for (const { fin, opcode, data } of decoded.frames) {
        if (opcode === 8) return close()
        if (opcode === 9) { socket.write(encodeFrame(data, false, 10)); continue }
        if (opcode === 10) continue
        if (opcode === 0 || !fin) {
          // Fragmented message: collect until the final frame.
          if (opcode !== 0) peer.partOp = opcode
          peer.parts.push(data)
          if (peer.parts.reduce((n, p) => n + p.length, 0) > limits.message) return close(1009)
          if (fin) { deliver(peer.partOp, Buffer.concat(peer.parts)); peer.parts = [] }
          continue
        }
        deliver(opcode, data)
      }
    })
    socket.on('close', () => { peer.alive = false; leave() })
    socket.on('error', () => { peer.alive = false; leave() })
    return peer
  }

  const peers = new Set()
  function upgrade(req, socket) {
    const key = req.headers['sec-websocket-key']
    if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key) { socket.destroy(); return }
    if (!(allowMissingOrigin && !req.headers.origin) && !originAllowed(req.headers.origin, origins)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    socket.setNoDelay(true)
    const peer = attach(socket)
    peers.add(peer)
    socket.on('close', () => peers.delete(peer))
  }

  // Refill rate budgets every second; drop idle connections.
  const timer = setInterval(() => {
    const now = Date.now()
    for (const peer of peers) {
      peer.budget = Math.max(0, peer.budget - (peer.room?.host === peer ? limits.hostRate : limits.guestRate))
      if (now - peer.last > limits.idleMs) peer.socket.destroy()
      else if (!peer.socket.destroyed) peer.socket.write(encodeFrame(Buffer.alloc(0), false, 9))
    }
  }, 1000)
  timer.unref?.()

  return { upgrade, rooms, peers, stop: () => clearInterval(timer) }
}

export function startRelay({ port = 4191, host = '127.0.0.1', origins = defaultOrigins, log = console.log, limits = LIMITS, allowMissingOrigin = false } = {}) {
  const relay = createRelay({ origins, log, limits, allowMissingOrigin })
  const server = createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 426, { 'content-type': 'text/plain' })
    res.end(req.url === '/health' ? `ok ${relay.rooms.size} rooms\n` : 'Powder Rave relay: connect with WebSocket.\n')
  })
  server.on('upgrade', relay.upgrade)
  return new Promise(resolve => server.listen(port, host, () => resolve({ server, relay, port: server.address().port })))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.RAVE_RELAY_PORT || 4191)
  const origins = (process.env.RAVE_RELAY_ORIGINS || defaultOrigins.join(',')).split(',').map(s => s.trim()).filter(Boolean)
  const { port: bound } = await startRelay({ port, origins })
  console.log(`Powder Rave relay on 127.0.0.1:${bound} for ${origins.join(', ')} (+ localhost)`)
}
