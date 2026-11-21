const KEY = 'powder-rave-director-connection-v1'
export function loadConnection(storage) {
  try {
    const data = JSON.parse(storage.getItem(KEY) || 'null')
    if (data && typeof data.url === 'string' && typeof data.token === 'string' && data.token.length >= 32)
      return { url: data.url, token: data.token, remember: true }
  } catch { /* storage may be unavailable */ }
  return { url: '', token: '', remember: false }
}
export function saveConnection(storage, url, token, remember) {
  if (!remember) { storage.removeItem(KEY); return }
  storage.setItem(KEY, JSON.stringify({ url, token }))
}
export function forgetConnection(storage) {
  storage.removeItem(KEY)
  storage.removeItem('powder-rave-director-url')
}
