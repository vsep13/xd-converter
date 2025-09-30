declare module 'node:fs/promises' {
  export function readFile(path: string | URL): Promise<Uint8Array>
  export function writeFile(path: string | URL, data: string | Uint8Array): Promise<void>
}

declare module 'node:path' {
  export function basename(path: string): string
  export function extname(path: string): string
  export function resolve(...segments: string[]): string
}

declare module 'node:process' {
  const process: {
    argv: string[]
    cwd(): string
    stdout: {
      write(buffer: string | Uint8Array, callback?: (error?: Error | null) => void): void
    }
    exitCode?: number
  }
  export default process
}

declare const Buffer: {
  from(source: ArrayBuffer | ArrayBufferView): Buffer
}

interface Buffer extends Uint8Array {
  toString(encoding?: string): string
}
