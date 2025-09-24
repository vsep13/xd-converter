declare const __APP_VERSION__: string | undefined
declare const __BUILD_TIMESTAMP__: string | undefined

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : new Date().toISOString()
