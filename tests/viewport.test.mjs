import assert from 'node:assert/strict'
import test from 'node:test'
import { fitWorld, localPoint } from '../src/viewport.ts'

test('toolbar offsets do not move the brush away from the clicked world cell', () => {
  for (const [width, height, left, top] of [[1256, 474, 12, 64], [374, 546, 8, 108], [820, 220, 12, 48]]) {
    const view = fitWorld(width, height, 380, 238)
    for (const [x, y] of [[0, 0], [190, 119], [379, 237]]) {
      const point = localPoint(left + view.x + (x + .5) * view.scale, top + view.y + (y + .5) * view.scale, { left, top })
      assert.equal(Math.floor((point.sx - view.x) / view.scale), x)
      assert.equal(Math.floor((point.sy - view.y) / view.scale), y)
    }
  }
})

test('resizing and imported worlds keep every edge inside the unobstructed playfield', () => {
  for (const [width, height] of [[374, 546], [1256, 474], [820, 220]]) {
    for (const [worldWidth, worldHeight] of [[380, 238], [80, 400], [1000, 100]]) {
      const view = fitWorld(width, height, worldWidth, worldHeight)
      assert.ok(view.x >= -1e-9 && view.y >= -1e-9)
      assert.ok(view.x + worldWidth * view.scale <= width + 1e-9)
      assert.ok(view.y + worldHeight * view.scale <= height + 1e-9)
      assert.ok(Math.abs(view.y + worldHeight * view.scale - height) < 1e-9, 'the ground stays at the bottom')
    }
  }
})
