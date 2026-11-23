import type { Tool } from './materials.ts'

/**
 * The browser side of online play: one WebSocket to the relay (server/rave-relay.mjs).
 * The host streams binary world snapshots; guests send small JSON actions that reach the host
 * wrapped as {t:'from', id, m}.
 */
export type Player = { id: number; name: string; host: boolean }
export type Role = 'host' | 'guest'

/** What a guest asks the host to do. Coordinates are grid cells. */
export type GuestAction =
  /** Press: a click tool fires once; anything else starts a stroke that pours while held. */
  | { a: 'down'; x: number; y: number; erase: boolean; tool: Tool; brush: number }
  | { a: 'move'; x: number; y: number }
  /** Sent while a stroke is held still, so the host keeps pouring (and stops if these stop). */
  | { a: 'hold' }
  | { a: 'up' }
  | { a: 'cursor'; x: number; y: number; tool: Tool; brush: number }
  | { a: 'drop' }

/** What the host tells guests besides world snapshots. */
export type HostNote =
  | { t: 'music'; source: 'demo' | 'file' | 'mic' | 'tab' | null; time: number; name: string; duration: number }
  | { t: 'toast'; text: string }

export type OnlineEvents = {
  room: (code: string, you: number, players: Player[], role: Role) => void
  players: (players: Player[]) => void
  snapshot: (bytes: Uint8Array) => void
  action: (from: number, action: GuestAction) => void
  note: (note: HostNote) => void
  closed: (reason: string) => void
}

/** The public relay (server/rave-relay.mjs behind Tailscale Funnel). */
export const PUBLIC_RELAY = 'wss://serveroverlord.tail79679d.ts.net:10000'

/** The relay address: ?relay= for testing, else VITE_RAVE_RELAY, else localhost in development and the public relay in builds. */
export function relayUrl(search = typeof location === 'undefined' ? '' : location.search) {
  const fromQuery = new URLSearchParams(search).get('relay')
  if (fromQuery && /^wss?:\/\//.test(fromQuery)) return fromQuery
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env
  if (typeof env?.VITE_RAVE_RELAY === 'string' && env.VITE_RAVE_RELAY) return env.VITE_RAVE_RELAY
  return env?.DEV ? 'ws://127.0.0.1:4191' : PUBLIC_RELAY
}

const ROOM = /^[A-Z]{4}$/
export const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
export const validCode = (code: string) => ROOM.test(code)

export class Online {
  role: Role | null = null
  code = ''
  you = 0
  players: Player[] = []
  private ws: WebSocket | null = null
  private handlers: Partial<OnlineEvents> = {}
  private closing = false
  private heartbeat: ReturnType<typeof setInterval> | null = null

  private stopHeartbeat() {
    if (this.heartbeat !== null) clearInterval(this.heartbeat)
    this.heartbeat = null
  }

  on<K extends keyof OnlineEvents>(event: K, handler: OnlineEvents[K]) { this.handlers[event] = handler; return this }

  get connected() { return !!this.ws && this.ws.readyState === WebSocket.OPEN && !!this.role }
  /** Bytes waiting to go out; the host skips snapshots while the link is backed up. */
  get backlog() { return this.ws?.bufferedAmount ?? 0 }

  private open(url: string, first: object, role: Role) {
    this.leave()
    this.closing = false
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      this.ws = ws
      const fail = (reason: string) => {
        if (this.ws !== ws) return
        this.stopHeartbeat()
        if (!settled) { settled = true; reject(new Error(reason)) }
        else if (!this.closing) this.handlers.closed?.(reason)
        this.role = null
      }
      ws.onopen = () => ws.send(JSON.stringify(first))
      ws.onerror = () => fail('Could not reach the rave server. If your browser asked to allow local network access, allow it and try again.')
      ws.onclose = () => fail(this.role === 'guest' ? 'Lost the connection to the rave.' : 'The rave server connection closed.')
      ws.onmessage = event => {
        if (this.ws !== ws) return
        if (event.data instanceof ArrayBuffer) { this.handlers.snapshot?.(new Uint8Array(event.data)); return }
        let message: { t?: string; [k: string]: unknown }
        try { message = JSON.parse(String(event.data)) } catch { return }
        if (message.t === 'room') {
          this.role = role; this.code = String(message.code); this.you = Number(message.you); this.players = message.players as Player[]
          this.stopHeartbeat()
          // The relay expires idle peers after 90 seconds, including solo hosts
          // waiting for friends and guests watching without sending actions.
          this.heartbeat = setInterval(() => {
            if (this.ws === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'keepalive' }))
          }, 25_000)
          settled = true
          this.handlers.room?.(this.code, this.you, this.players, role)
          resolve()
        } else if (message.t === 'error') {
          fail(String(message.reason))
          this.closing = true; this.ws = null; ws.close()
        } else if (message.t === 'players') {
          this.players = message.players as Player[]
          this.handlers.players?.(this.players)
        } else if (message.t === 'closed') {
          this.stopHeartbeat()
          this.closing = true
          this.role = null
          this.ws = null
          this.handlers.closed?.('The host ended the rave.')
          ws.close()
        } else if (message.t === 'from' && this.role === 'host') {
          this.handlers.action?.(Number(message.id), message.m as GuestAction)
        } else if (this.role === 'guest' && (message.t === 'music' || message.t === 'toast')) {
          this.handlers.note?.(message as HostNote)
        }
      }
    })
  }

  host(name: string, url = relayUrl()) { return this.open(url, { t: 'host', name }, 'host') }
  join(code: string, name: string, url = relayUrl()) { return this.open(url, { t: 'join', code: cleanCode(code), name }, 'guest') }

  /** Guests: ask the host to do something. Hosts: tell every guest something. */
  send(message: GuestAction | HostNote) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }
  sendSnapshot(bytes: Uint8Array) {
    if (this.role === 'host' && this.ws?.readyState === WebSocket.OPEN) this.ws.send(bytes)
  }

  leave() {
    this.stopHeartbeat()
    this.closing = true
    this.role = null
    this.players = []
    if (this.ws) { try { this.ws.close() } catch { /* already closed */ } }
    this.ws = null
  }
}

/** A friendly default name like "Raver 42". */
export const randomName = () => `Raver ${10 + Math.floor(Math.random() * 90)}`
