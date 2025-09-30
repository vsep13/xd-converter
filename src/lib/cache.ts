
const DB_NAME = 'xd-converter-cache'
const STORE_NAME = 'files'
const DB_VERSION = 1
const MAX_ENTRIES = 10

export type CachedEntryType = 'library' | 'preset'

export interface CachedFileMeta {
  id: string
  name: string
  type: CachedEntryType
  size: number
  timestamp: number
}

interface CachedFileRecord extends CachedFileMeta {
  data: Blob
}

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const withStore = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>) => {
    const db = await openDatabase()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const store = tx.objectStore(STORE_NAME)
      fn(store)
        .then(resolve)
        .catch(reject)
      tx.oncomplete = () => db.close()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    })
  }

export const listCachedFiles = async (): Promise<CachedFileMeta[]> =>
  withStore('readonly', async (store) =>
    new Promise<CachedFileMeta[]>((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const records = (request.result as CachedFileRecord[]) ?? []
        const sorted = records
          .map((record) => {
            const { data, ...meta } = record
            void data
            return meta
          })
          .sort((a, b) => b.timestamp - a.timestamp)
        resolve(sorted)
      }
      request.onerror = () => reject(request.error)
    }),
  )

export const loadCachedFile = async (id: string): Promise<ArrayBuffer> =>
  withStore('readonly', async (store) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const record = request.result as CachedFileRecord | undefined
        if (!record) {
          reject(new Error('Cached file not found'))
          return
        }
        record.data
          .arrayBuffer()
          .then(resolve)
          .catch(reject)
      }
      request.onerror = () => reject(request.error)
    }),
  )

const deleteCachedFile = async (id: string) =>
  withStore('readwrite', async (store) =>
    new Promise<void>((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    }),
  )

export const clearCachedFiles = async () =>
  withStore('readwrite', async (store) =>
    new Promise<void>((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    }),
  )

const ensureCapacity = async (store: IDBObjectStore) =>
  new Promise<void>((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = async () => {
      const records = (request.result as CachedFileRecord[]) ?? []
      if (records.length <= MAX_ENTRIES) {
        resolve()
        return
      }
      const sorted = records.sort((a, b) => a.timestamp - b.timestamp)
      const excess = sorted.length - MAX_ENTRIES
      try {
        for (let i = 0; i < excess; i += 1) {
          const target = sorted[i]
          await new Promise<void>((res, rej) => {
            const delReq = store.delete(target.id)
            delReq.onsuccess = () => res()
            delReq.onerror = () => rej(delReq.error)
          })
        }
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error)
  })

export const saveCachedFile = async (meta: Omit<CachedFileMeta, 'timestamp' | 'size'> & { buffer: ArrayBuffer; size?: number }) => {
  const { buffer, size, ...rest } = meta
  const record: CachedFileRecord = {
    ...rest,
    size: size ?? buffer.byteLength,
    timestamp: Date.now(),
    data: new Blob([buffer]),
  }

  await withStore('readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    await ensureCapacity(store)
    return undefined
  })
}

export const removeCachedFile = deleteCachedFile
