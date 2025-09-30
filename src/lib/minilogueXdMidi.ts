import { attachInputListener, getMidiInputById, getMidiOutputById, identityRequest, requestMidiAccess, sendMidiMessage } from './midi'
import { createPatchHash, type RawXdPatch } from './minilogueXd'

const SYSEX_START = 0xf0
const SYSEX_END = 0xf7
const KORG_ID = 0x42
const SEARCH_CATEGORY = 0x50
const SEARCH_REQ = 0x00
const LOGUE_FORMAT = 0x00
const LOGUE_SUB_ID = 0x01
const MINILOGUE_XD_FAMILY_ID = 0x51
const STATUS_BASE = 0x20
const STATUS_ACK = 0x23

const FUNCTION_CURRENT_PROGRAM_DUMP_REQUEST = 0x10
const FUNCTION_PROGRAM_DUMP_REQUEST = 0x1c
const FUNCTION_CURRENT_PROGRAM_DUMP = 0x40
const FUNCTION_PROGRAM_DUMP = 0x4c

const PROGRAM_PARAMETER_SIZE = 336
const PROGRAM_PACKED_SIZE = 384
const PATCH_BINARY_SIZE = 1024
const PROGRAM_NAME_OFFSET = 4
const PROGRAM_NAME_LENGTH = 12

const asciiEncoder = new TextEncoder()
const asciiDecoder = new TextDecoder('utf-8')

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const clampChannel = (value: number) => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 15) return 15
  return Math.floor(value)
}

const createHeader = (channel: number) => new Uint8Array([SYSEX_START, KORG_ID, 0x30 + clampChannel(channel), LOGUE_FORMAT, LOGUE_SUB_ID, MINILOGUE_XD_FAMILY_ID])

const buildSevenBitPacked = (input: Uint8Array): Uint8Array => {
  const blocks = Math.ceil(input.length / 7)
  const result = new Uint8Array(blocks * 8)
  let inputOffset = 0
  let outputOffset = 0

  for (let block = 0; block < blocks; block += 1) {
    let header = 0
    const chunk: number[] = []
    for (let i = 0; i < 7; i += 1) {
      const value = inputOffset < input.length ? input[inputOffset] : 0
      if (value & 0x80) {
        header |= 1 << i
      }
      chunk.push(value & 0x7f)
      inputOffset += 1
    }
    result[outputOffset] = header & 0x7f
    outputOffset += 1
    for (let i = 0; i < chunk.length; i += 1) {
      result[outputOffset] = chunk[i]
      outputOffset += 1
    }
  }

  return result
}

const unpackSevenBit = (input: Uint8Array, expectedLength: number): Uint8Array => {
  const result = new Uint8Array(expectedLength)
  let outputOffset = 0

  for (let offset = 0; offset < input.length; offset += 8) {
    const header = input[offset]
    for (let i = 0; i < 7; i += 1) {
      if (outputOffset >= expectedLength) {
        return result
      }
      const data = input[offset + 1 + i]
      if (data === undefined) {
        throw new Error('Unexpected end of packed data')
      }
      const msb = ((header ?? 0) >> i) & 0x01
      result[outputOffset] = (msb << 7) | (data & 0x7f)
      outputOffset += 1
    }
  }

  if (outputOffset !== expectedLength) {
    throw new Error('Packed payload did not expand to expected length')
  }

  return result
}

const copyProgramName = (target: Uint8Array, name: string) => {
  const bytes = asciiEncoder.encode(name.trim().slice(0, PROGRAM_NAME_LENGTH))
  target.fill(0, PROGRAM_NAME_OFFSET, PROGRAM_NAME_OFFSET + PROGRAM_NAME_LENGTH)
  target.set(bytes.slice(0, PROGRAM_NAME_LENGTH), PROGRAM_NAME_OFFSET)
}

const readProgramName = (data: Uint8Array) => {
  const slice = data.subarray(PROGRAM_NAME_OFFSET, PROGRAM_NAME_OFFSET + PROGRAM_NAME_LENGTH)
  const zeroIndex = slice.findIndex((byte) => byte === 0)
  const view = zeroIndex === -1 ? slice : slice.subarray(0, zeroIndex)
  return asciiDecoder.decode(view).trim() || 'Untitled'
}

const createProgInfoXml = (name: string, comment?: string | null, programmer?: string | null) => {
  const safeName = name || 'Untitled'
  const safeComment = comment ?? ''
  const safeProgrammer = programmer ?? ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<EProgramData>\n  <Program>\n    <Name>${escapeXml(safeName)}</Name>\n    <Comment>${escapeXml(safeComment)}</Comment>\n    <Programmer>${escapeXml(safeProgrammer)}</Programmer>\n  </Program>\n</EProgramData>`
}

const createProgBinFromProgramData = (programData: Uint8Array): Uint8Array => {
  if (programData.length !== PROGRAM_PARAMETER_SIZE) {
    throw new Error(`Unexpected program data size: ${programData.length}`)
  }
  const buffer = new Uint8Array(PATCH_BINARY_SIZE)
  buffer.set(programData, 0)
  return buffer
}

const extractProgramFace = (patch: RawXdPatch): Uint8Array => {
  if (patch.progBin.length < PROGRAM_PARAMETER_SIZE) {
    throw new Error('Patch binary is smaller than expected')
  }
  return patch.progBin.subarray(0, PROGRAM_PARAMETER_SIZE)
}

type DumpKind = 'current-program' | 'program' | 'global'

type PendingProgramResolve = {
  kind: DumpKind
  programIndex: number | null
  resolve: (patch: RawXdPatch) => void
  reject: (error: Error) => void
  timeoutId: number
}

type PendingStatusResolve = {
  resolve: (code: number) => void
  reject: (error: Error) => void
  timeoutId: number
}

type LibrarianOptions = {
  midiChannel?: number
  requestTimeoutMs?: number
}

const DEFAULT_TIMEOUT = 5000

export class MinilogueXdLibrarian {
  private readonly access: MIDIAccess
  private readonly midiChannel: number
  private readonly requestTimeout: number

  private input: MIDIInput | null = null
  private output: MIDIOutput | null = null
  private detachInput: (() => void) | null = null

  private pendingProgram: PendingProgramResolve | null = null
  private pendingStatus: PendingStatusResolve | null = null
  private pendingSearch: {
    resolve: (info: MinilogueXdIdentity) => void
    reject: (error: Error) => void
    timeoutId: number
    token: number
  } | null = null

  constructor(access: MIDIAccess, options: LibrarianOptions = {}) {
    this.access = access
    this.midiChannel = clampChannel(options.midiChannel ?? 0)
    this.requestTimeout = options.requestTimeoutMs ?? DEFAULT_TIMEOUT
  }

  static async connect(options: LibrarianOptions & { inputId: string; outputId: string }) {
    const access = await requestMidiAccess()
    const librarian = new MinilogueXdLibrarian(access, options)
    await librarian.attach(options.inputId, options.outputId)
    return librarian
  }

  async attach(inputId: string, outputId: string) {
    this.detach()
    const input = getMidiInputById(this.access, inputId)
    const output = getMidiOutputById(this.access, outputId)

    if (!input) {
      throw new Error(`MIDI input ${inputId} was not found`)
    }
    if (!output) {
      throw new Error(`MIDI output ${outputId} was not found`)
    }

    this.input = input
    this.output = output
    this.detachInput = attachInputListener(input, (event) => this.handleMessage(event))
  }

  detach() {
    if (this.detachInput) {
      this.detachInput()
      this.detachInput = null
    }
    this.input = null
    this.output = null
    this.pendingProgram = null
    this.pendingStatus = null
    this.pendingSearch = null
  }

  async probe(): Promise<MinilogueXdIdentity> {
    if (!this.output) {
      throw new Error('MIDI output is not connected')
    }
    const token = Math.floor(Math.random() * 0x7f)
    const message = new Uint8Array([SYSEX_START, KORG_ID, SEARCH_CATEGORY, SEARCH_REQ, token & 0x7f, SYSEX_END])

    if (this.pendingSearch) {
      clearTimeout(this.pendingSearch.timeoutId)
      this.pendingSearch.reject(new Error('Probe was superseded by a new request'))
      this.pendingSearch = null
    }

    const identity = await new Promise<MinilogueXdIdentity>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingSearch = null
        reject(new Error('No response to search device request'))
      }, this.requestTimeout)

      this.pendingSearch = { resolve, reject, timeoutId, token }
      sendMidiMessage(this.output!, message)
    })

    return identity
  }

  async requestIdentity(): Promise<Uint8Array> {
    if (!this.output) {
      throw new Error('MIDI output is not connected')
    }
    sendMidiMessage(this.output, identityRequest)
    return new Promise<Uint8Array>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Identity reply timeout'))
      }, this.requestTimeout)

      const remove = attachInputListener(this.input!, (event) => {
        const data = event.data
        if (!data || data.length < 5) {
          return
        }
        if (data[0] === SYSEX_START && data[1] === 0x7e && data[3] === 0x06 && data[4] === 0x02) {
          remove()
          clearTimeout(timeoutId)
          resolve(data)
        }
      })
    })
  }

  async requestCurrentProgram(): Promise<RawXdPatch> {
    return this.enqueueProgramRequest('current-program', null, new Uint8Array([FUNCTION_CURRENT_PROGRAM_DUMP_REQUEST]))
  }

  async requestProgram(programIndex: number): Promise<RawXdPatch> {
    if (programIndex < 0 || programIndex > 0x1ff) {
      throw new Error('Program index must be between 0 and 511')
    }
    const lsb = programIndex & 0x7f
    const msb = (programIndex >> 7) & 0x7f
    return this.enqueueProgramRequest('program', programIndex, new Uint8Array([FUNCTION_PROGRAM_DUMP_REQUEST, lsb, msb]))
  }

  async sendProgram(programIndex: number, patch: RawXdPatch): Promise<void> {
    if (!this.output) {
      throw new Error('MIDI output is not connected')
    }
    if (this.pendingProgram) {
      throw new Error('Another request is still pending')
    }

    const programData = extractProgramFace(patch)
    const packed = buildSevenBitPacked(programData)
    if (packed.length !== PROGRAM_PACKED_SIZE) {
      throw new Error('Packed program data has unexpected size')
    }

    const lsb = programIndex & 0x7f
    const msb = (programIndex >> 7) & 0x7f

    const header = createHeader(this.midiChannel)
    const payload = new Uint8Array(header.length + 2 + PROGRAM_PACKED_SIZE + 1)
    payload.set(header, 0)
    const base = header.length
    payload[base] = FUNCTION_PROGRAM_DUMP
    payload[base + 1] = lsb
    payload[base + 2] = msb
    payload.set(packed, base + 3)
    payload[payload.length - 1] = SYSEX_END

    const statusPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingStatus = null
        reject(new Error('No acknowledgement from device'))
      }, this.requestTimeout)
      this.pendingStatus = {
        resolve: (code) => {
          clearTimeout(timeoutId)
          this.pendingStatus = null
          if (code === STATUS_ACK) {
            resolve()
          } else {
            reject(new Error(`Device returned status 0x${code.toString(16)}`))
          }
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          this.pendingStatus = null
          reject(error)
        },
        timeoutId,
      }
    })

    sendMidiMessage(this.output, payload)
    await statusPromise
  }

  private enqueueProgramRequest(kind: DumpKind, programIndex: number | null, command: Uint8Array) {
    if (!this.output || !this.input) {
      throw new Error('MIDI ports are not connected')
    }
    if (this.pendingProgram) {
      throw new Error('Another request is still pending')
    }

    const message = new Uint8Array(createHeader(this.midiChannel).length + command.length + 1)
    message.set(createHeader(this.midiChannel), 0)
    message.set(command, createHeader(this.midiChannel).length)
    message[message.length - 1] = SYSEX_END

    const promise = new Promise<RawXdPatch>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingProgram = null
        reject(new Error('Timed out waiting for program dump'))
      }, this.requestTimeout)
      this.pendingProgram = { kind, programIndex, resolve, reject, timeoutId }
    })

    sendMidiMessage(this.output, message)
    return promise
  }

  private handleMessage(event: MIDIMessageEvent) {
    const data = event.data
    if (!data || data.length < 2) return

    if (data[0] === SYSEX_START && data[1] === KORG_ID) {
      if (data[2] === SEARCH_CATEGORY) {
        this.handleSearchReply(data)
        return
      }

      if (data.length < 7) return
      const isLogue = data[3] === LOGUE_FORMAT && data[4] === LOGUE_SUB_ID && data[5] === MINILOGUE_XD_FAMILY_ID
      if (!isLogue) return
      const functionId = data[6]
      switch (functionId) {
        case FUNCTION_PROGRAM_DUMP:
          this.resolveProgramDump(data)
          break
        case FUNCTION_CURRENT_PROGRAM_DUMP:
          this.resolveCurrentProgram(data)
          break
        default:
          if (functionId >= STATUS_BASE && functionId <= STATUS_BASE + 0x0f) {
            this.resolveStatus(functionId)
          }
          break
      }
    }
  }

  private resolveProgramDump(message: Uint8Array) {
    if (!this.pendingProgram || this.pendingProgram.kind === 'current-program') return
    const { programIndex } = this.pendingProgram

    const lsb = message[7] & 0x7f
    const msb = message[8] & 0x7f
    const receivedIndex = (msb << 7) | lsb
    const payload = message.subarray(9, message.length - 1)

    try {
      const patch = programDataToPatch(payload)
      const resolved = { ...patch, index: programIndex ?? receivedIndex }
      this.pendingProgram.resolve(resolved)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.pendingProgram.reject(err)
    } finally {
      clearTimeout(this.pendingProgram.timeoutId)
      this.pendingProgram = null
    }
  }

  private resolveCurrentProgram(message: Uint8Array) {
    if (!this.pendingProgram || this.pendingProgram.kind !== 'current-program') return
    const payload = message.subarray(7, message.length - 1)
    try {
      const patch = programDataToPatch(payload)
      this.pendingProgram.resolve({ ...patch, index: this.pendingProgram.programIndex ?? -1 })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.pendingProgram.reject(err)
    } finally {
      clearTimeout(this.pendingProgram.timeoutId)
      this.pendingProgram = null
    }
  }

  private resolveStatus(code: number) {
    if (this.pendingStatus) {
      const handler = this.pendingStatus
      handler.resolve(code)
    }
  }

  private handleSearchReply(message: Uint8Array) {
    if (!this.pendingSearch) return
    const token = this.pendingSearch.token
    if (message.length < 15) return
    const replyToken = message[5] & 0x7f
    if (replyToken !== token) return
    const info: MinilogueXdIdentity = {
      globalChannel: message[4] & 0x0f,
      familyId: message[6] | (message[7] << 7),
      memberId: message[8] | (message[9] << 7),
      firmwareVersion: {
        minor: message[10] | (message[11] << 7),
        major: message[12] | (message[13] << 7),
      },
    }
    clearTimeout(this.pendingSearch.timeoutId)
    this.pendingSearch.resolve(info)
    this.pendingSearch = null
  }
}

export type MinilogueXdIdentity = {
  globalChannel: number
  familyId: number
  memberId: number
  firmwareVersion: {
    major: number
    minor: number
  }
}

export const programDataToPatch = (packed: Uint8Array): RawXdPatch => {
  if (packed.length !== PROGRAM_PACKED_SIZE) {
    throw new Error(`Program dump payload has unexpected size (${packed.length})`)
  }
  const programData = unpackSevenBit(packed, PROGRAM_PARAMETER_SIZE)
  const progBin = createProgBinFromProgramData(programData)
  const name = readProgramName(programData)
  const progInfoXml = createProgInfoXml(name)
  return {
    index: -1,
    name,
    progBin,
    progInfoXml,
    comment: null,
    programmer: null,
    status: undefined,
    hash: createPatchHash(progBin),
  }
}

export const patchToProgramData = (patch: RawXdPatch): Uint8Array => {
  const data = new Uint8Array(PROGRAM_PARAMETER_SIZE)
  data.set(extractProgramFace(patch))
  copyProgramName(data, patch.name)
  return buildSevenBitPacked(data)
}

export const buildProgramDumpRequest = (programIndex: number, channel = 0) => {
  const header = createHeader(channel)
  const lsb = programIndex & 0x7f
  const msb = (programIndex >> 7) & 0x7f
  const payload = new Uint8Array(header.length + 3)
  payload.set(header, 0)
  payload[header.length] = FUNCTION_PROGRAM_DUMP_REQUEST
  payload[header.length + 1] = lsb
  payload[header.length + 2] = msb
  payload[payload.length - 1] = SYSEX_END
  return payload
}

export const buildCurrentProgramDumpRequest = (channel = 0) => {
  const header = createHeader(channel)
  const payload = new Uint8Array(header.length + 2)
  payload.set(header, 0)
  payload[header.length] = FUNCTION_CURRENT_PROGRAM_DUMP_REQUEST
  payload[payload.length - 1] = SYSEX_END
  return payload
}

export const buildProgramDumpMessage = (programIndex: number, programData: Uint8Array, channel = 0) => {
  if (programData.length !== PROGRAM_PACKED_SIZE) {
    throw new Error('Program data is not packed or has unexpected length')
  }
  const header = createHeader(channel)
  const lsb = programIndex & 0x7f
  const msb = (programIndex >> 7) & 0x7f
  const payload = new Uint8Array(header.length + 3 + PROGRAM_PACKED_SIZE + 1)
  payload.set(header, 0)
  const base = header.length
  payload[base] = FUNCTION_PROGRAM_DUMP
  payload[base + 1] = lsb
  payload[base + 2] = msb
  payload.set(programData, base + 3)
  payload[payload.length - 1] = SYSEX_END
  return payload
}
