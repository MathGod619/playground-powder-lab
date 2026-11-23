/**
 * Bound compressed network work on slow guests. Deltas cannot be dropped and then
 * applied to an old base: invalidate that base and recover on the next keyframe.
 */
export class SnapshotInbox {
  private pending: Uint8Array[] = []
  private epoch = 0
  private running: Promise<void> | null = null
  private decode: (packed: Uint8Array) => Promise<Uint8Array>
  private apply: (bytes: Uint8Array) => void
  private invalidate: () => void
  private limit: number

  constructor(
    decode: (packed: Uint8Array) => Promise<Uint8Array>,
    apply: (bytes: Uint8Array) => void,
    invalidate: () => void,
    limit = 4,
  ) { this.decode = decode; this.apply = apply; this.invalidate = invalidate; this.limit = limit }

  offer(packed: Uint8Array) {
    if (this.pending.length >= this.limit) this.reset()
    this.pending.push(packed)
    if (!this.running) this.start()
  }

  reset() {
    this.pending.length = 0
    this.epoch++
    this.invalidate()
  }

  private start() {
    this.running = this.drain().finally(() => {
      this.running = null
      if (this.pending.length) this.start()
    })
  }

  private async drain() {
    while (this.pending.length) {
      const packed = this.pending.shift()!, epoch = this.epoch
      try {
        const bytes = await this.decode(packed)
        if (epoch === this.epoch) this.apply(bytes)
      } catch { if (epoch === this.epoch) this.invalidate() }
    }
  }

  async whenIdle() { while (this.running) await this.running }
}
