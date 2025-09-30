export class MidiUnavailableError extends Error {
  constructor(message = 'Web MIDI is not available in this browser') {
    super(message)
    this.name = 'MidiUnavailableError'
  }
}

export type MidiAccess = MIDIAccess

export type MidiPortKind = 'input' | 'output'

export interface MidiPortInfo {
  id: string
  name: string
  manufacturer: string | null
  state: MIDIPortDeviceState
  connection: MIDIPortConnectionState
}

export const requestMidiAccess = async (): Promise<MIDIAccess> => {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
    throw new MidiUnavailableError()
  }

  try {
    const access = await navigator.requestMIDIAccess({ sysex: true })
    return access
  } catch (error) {
    throw new MidiUnavailableError(error instanceof Error ? error.message : 'Failed to obtain MIDI access')
  }
}

const toArray = <T>(iterable: Iterable<T>) => Array.from(iterable)

export const listMidiInputs = (access: MIDIAccess): MidiPortInfo[] =>
  toArray(access.inputs.values()).map((port) => ({
    id: port.id,
    name: port.name ?? 'Unknown input',
    manufacturer: port.manufacturer ?? null,
    state: port.state,
    connection: port.connection,
  }))

export const listMidiOutputs = (access: MIDIAccess): MidiPortInfo[] =>
  toArray(access.outputs.values()).map((port) => ({
    id: port.id,
    name: port.name ?? 'Unknown output',
    manufacturer: port.manufacturer ?? null,
    state: port.state,
    connection: port.connection,
  }))

export const getMidiInputById = (access: MIDIAccess, id: string): MIDIInput | null => {
  const port = access.inputs.get(id) ?? null
  return port ?? null
}

export const getMidiOutputById = (access: MIDIAccess, id: string): MIDIOutput | null => {
  const port = access.outputs.get(id) ?? null
  return port ?? null
}

export const sendMidiMessage = (output: MIDIOutput, data: Uint8Array | number[]) => {
  const payload = data instanceof Uint8Array ? data : Uint8Array.from(data)
  try {
    output.send(payload)
  } catch (error) {
    console.warn('Failed to send MIDI message', error)
    throw error
  }
}

type MidiMessageHandler = (event: MIDIMessageEvent) => void

export const attachInputListener = (input: MIDIInput, handler: MidiMessageHandler) => {
  const wrapped: MidiMessageHandler = (event) => handler(event)
  input.addEventListener('midimessage', wrapped)
  return () => input.removeEventListener('midimessage', wrapped)
}

export const identityRequest = new Uint8Array([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])
