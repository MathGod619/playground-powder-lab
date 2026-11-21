type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function loadConnection(storage: StorageLike): { url: string; token: string; remember: boolean }
export function saveConnection(storage: StorageLike, url: string, token: string, remember: boolean): void
export function forgetConnection(storage: StorageLike): void
