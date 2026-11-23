import { BEAT_GLITTER, BEAT_ROCKET, BEAT_SAND, BLAST, ERASE, M } from './materials.ts'

/** Small, reusable SVG artwork based on the approved Sampler concept. */
export function MaterialIcon({ tool }: { tool: number }) {
  const base = tool === BEAT_SAND ? M.Sand : tool === BEAT_GLITTER ? M.Glitter : tool === BEAT_ROCKET ? M.Rocket : tool
  const art = (() => {
    switch (base) {
      case M.Sand: return <g fill="#E7BD69"><path d="M4 30 19 7l17 23Z" /><path d="m8 28 11-17 13 17" fill="none" stroke="#B98434" strokeWidth="2" strokeDasharray="1 4" /><path d="M14 26h2m4-8h2m2 8h2m-7-2h2" stroke="#FFE3A4" strokeWidth="2" /></g>
      case M.Water: return <path d="m3 12 5-4 6 4 6-4 6 4 6-4 5 4M3 21l5-4 6 4 6-4 6 4 6-4 5 4M3 30l5-4 6 4 6-4 6 4 6-4 5 4" fill="none" stroke="#5CA8D7" strokeWidth="2.8" strokeLinejoin="round" />
      case M.Wall: case M.Brick: return <g><path d="M4 7h32v26H4Z" fill={base === M.Wall ? '#92958E' : '#B95D3D'} /><path d="M4 15h32M4 24h32M14 7v8m13-8v8M10 15v9m13-9v9m-8 0v9m14-9v9" stroke="#252623" strokeWidth="1.7" /></g>
      case M.Fire: return <g><path d="M21 3c3 11 12 14 11 23-1 13-26 14-25-1 0-5 4-10 7-14-1 9 3 9 4 6 2-4 1-9 3-14Z" fill="#EC562D" /><path d="M21 18c0 6 7 8 5 13-3 7-15 4-12-4l3-5c-1 6 2 7 4-4Z" fill="#F9BF4C" /></g>
      case M.Oil: return <g><path d="M20 3C16 12 7 20 8 27c1 14 24 14 25 0 0-7-9-15-13-24Z" fill="#9670BB" /><path d="M14 23c-3 6 0 9 5 10" fill="none" stroke="#C2A1DA" strokeWidth="2" /></g>
      case M.Lava: return <g><path d="m3 32 7-12 7 3 6-15 6 13 8 11Z" fill="#66534A" /><path d="m23 9 3 13-5 2 5 4-3 5H10l6-5 4-1-3-5Z" fill="#F4772D" /><path d="m23 14-2 8 4 5-5 5H9" fill="none" stroke="#FFCF56" strokeWidth="2" /></g>
      case M.Glitter: return <g fill="#AC80CE"><path d="m20 3 4 12 13 5-13 4-4 13-4-13L3 20l13-5Z" /><path d="m7 3 1 4 4 1-4 1-1 4-1-4-4-1 4-1Zm26 24 1 4 4 1-4 1-1 4-1-4-4-1 4-1Z" /></g>
      case M.Plant: return <g><path d="M20 35V18" stroke="#7B9A45" strokeWidth="3" /><path d="M20 25C6 25 4 15 5 9c11-1 17 5 15 16Zm1-8C19 7 27 3 36 5c0 9-6 16-15 12Z" fill="#8AB34E" /><path d="m20 25-9-10m10 4L30 9" stroke="#405B2F" strokeWidth="1.5" /></g>
      case M.Speaker: return <g><rect x="7" y="3" width="26" height="34" rx="2" fill="#85877E" /><path d="M10 6h20v28H10Z" fill="#343735" /><circle cx="20" cy="25" r="7" fill="#ADB0A1" /><circle cx="20" cy="25" r="4" fill="#272A29" /><circle cx="20" cy="12" r="4" fill="#A0A398" /><circle cx="20" cy="12" r="2" fill="#262826" /></g>
      case M.Rocket: return <g><path d="m13 25-7 9 3-13 6-4m10 8 1 6-7 3 1-9" fill="#9C9D8E" /><path d="M12 26C13 14 23 5 35 4c0 13-8 24-18 27Z" fill="#EEE9D7" /><circle cx="26" cy="14" r="4" fill="#343735" /><path d="m10 28-6 9 10-5 3-4" fill="#EF642E" /></g>
      case M.Gunpowder: return <g><path d="m4 32 13-20 15 20Z" fill="#96988F" /><path d="m18 13 5-8 8 2 4-4" fill="none" stroke="#D4C9A8" strokeWidth="1.5" /><path d="m33 2 5 6m-5 0 5-6" stroke="#F2A551" /><path d="M13 27h3m4-6h3m-1 8h3" stroke="#4B4E48" strokeWidth="2" /></g>
      case M.Bomb: return <g><circle cx="19" cy="24" r="13" fill="#D14D37" /><path d="m20 12 4-7 8 1 3-4" fill="none" stroke="#D8CCAB" strokeWidth="2" /><path d="M11 23a8 8 0 0 1 5-6" fill="none" stroke="#F69A73" strokeWidth="2" /><path d="m32 1 6 7m-6 0 6-7" stroke="#F2A551" strokeWidth="1.5" /></g>
      case M.Cloud: return <g><path d="M9 26a8 8 0 0 1 0-16 9 9 0 0 1 17-3 8 8 0 1 1 5 19Z" fill="#E3DFCD" /><path d="m10 30-3 6m13-6-3 6m13-6-3 6" stroke="#9ADDD5" strokeWidth="2.5" /></g>
      case BLAST: return <path d="m20 1 3 13 9-9-5 13 12 2-12 4 6 11-11-7-2 11-4-12-12 6 8-11-11-3 13-3-7-12 11 10Z" fill="#EC7A2E" />
      case ERASE: return <g transform="rotate(-42 20 20)"><rect x="9" y="5" width="22" height="30" rx="2" fill="#EEE8D3" /><path d="M9 24h22" stroke="#9D9B87" strokeWidth="1.5" /></g>
      default: return null
    }
  })()
  return <svg className="material-icon" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    {art}{base !== tool && <path d="M28 31v6m4-10v10m4-15v15" stroke="#EFEBDD" strokeWidth="2.5" />}
  </svg>
}
