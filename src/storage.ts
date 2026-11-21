let pending: Promise<IDBDatabase> | undefined

function database() {
  return pending ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('playground-powder-lab', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Browser storage is unavailable.'))
  }).catch(error => {
    pending = undefined
    throw error
  })
}

export async function readLocal(key: string): Promise<string | null> {
  let result: string | null = null
  try {
    const db = await database()
    result = await new Promise((resolve, reject) => {
      const request = db.transaction('sessions').objectStore('sessions').get(key)
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
      request.onerror = () => reject(request.error)
    })
  } catch {
    // Legacy storage still works when IndexedDB is unavailable.
  }
  return result ?? localStorage.getItem(key)
}

export async function writeLocal(key: string, data: string) {
  try {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('sessions', 'readwrite')
      transaction.objectStore('sessions').put(data, key)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  } catch {
    localStorage.setItem(key, data)
  }
}
