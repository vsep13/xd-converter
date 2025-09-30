import type { RawXdPatch } from './minilogueXd'

type AudioContextCtor = typeof AudioContext

export type PatchPreviewHandle = {
  stop: () => void
  finished: Promise<void>
}

type Envelope = {
  attack: number
  decay: number
  sustain: number
  release: number
}

type PreviewParams = {
  frequency1: number
  frequency2: number | null
  level1: number
  level2: number
  wave1: OscillatorType
  wave2: OscillatorType
  noiseLevel: number
  envelope: Envelope
  filterFrequency: number
  filterQ: number
}

const isBrowser = typeof window !== 'undefined'

const getAudioContextCtor = (): AudioContextCtor | null => {
  if (!isBrowser) return null
  if (typeof window.AudioContext === 'function') return window.AudioContext
  const webkit = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  return typeof webkit === 'function' ? webkit : null
}

let sharedContext: AudioContext | null = null

const ensureAudioContext = async (): Promise<AudioContext> => {
  const Ctor = getAudioContextCtor()
  if (!Ctor) {
    throw new Error('Web Audio API is not available in this environment')
  }
  if (!sharedContext) {
    sharedContext = new Ctor()
  }
  if (sharedContext.state === 'suspended') {
    try {
      await sharedContext.resume()
    } catch (error) {
      console.warn('Failed to resume AudioContext', error)
    }
  }
  return sharedContext
}

export const supportsAudioPreview = (): boolean => Boolean(getAudioContextCtor())

const SEMITONE = Math.pow(2, 1 / 12)
const MID_A = 440
const MID_A_MIDI = 69
const DEFAULT_NOTE = 60 // Middle C
const DEFAULT_OCTAVE_OFFSETS = [-2, -1, 0, 1, 2]
const MAX_PARAM = 1023
const BASE_ATTACK = 0.01
const BASE_DECAY = 0.02
const BASE_RELEASE = 0.05
const MAX_ATTACK = 6
const MAX_DECAY = 4
const MAX_RELEASE = 8
const DEFAULT_DURATION = 3.5

const waveTypes: OscillatorType[] = ['triangle', 'sawtooth', 'square']

const readUint8 = (view: DataView, offset: number) => (offset < view.byteLength ? view.getUint8(offset) : 0)
const readUint16 = (view: DataView, offset: number) => (offset + 1 < view.byteLength ? view.getUint16(offset, true) : 0)

const fraction = (value: number, max = MAX_PARAM) => {
  if (!Number.isFinite(value) || max <= 0) return 0
  return Math.min(Math.max(value / max, 0), 1)
}

const cancelParamScheduling = (param: AudioParam, time: number) => {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time)
  } else {
    const current = param.value
    param.cancelScheduledValues(time)
    param.setValueAtTime(current, time)
  }
}

const scaleTime = (value: number, base: number, maxTime: number) => {
  const norm = fraction(value)
  // Ease out so higher values climb faster towards the max.
  const curved = norm ** 2
  return base + curved * (maxTime - base)
}

const createEnvelope = (view: DataView): Envelope => {
  const attack = scaleTime(readUint16(view, 66), BASE_ATTACK, MAX_ATTACK)
  const decay = scaleTime(readUint16(view, 68), BASE_DECAY, MAX_DECAY)
  const sustain = fraction(readUint16(view, 70))
  const release = scaleTime(readUint16(view, 72), BASE_RELEASE, MAX_RELEASE)
  return { attack, decay, sustain, release }
}

const pitchToFrequency = (midiNote: number) => MID_A * Math.pow(SEMITONE, midiNote - MID_A_MIDI)

const resolveFrequency = (base: number, octave: number, pitch: number) => {
  const octaveOffset = DEFAULT_OCTAVE_OFFSETS[octave] ?? 0
  const normalizedPitch = fraction(pitch)
  const detuneSemitones = (normalizedPitch - 0.5) * 2 * 12 // +/- 12 semitones window
  const targetMidi = base + octaveOffset * 12 + detuneSemitones
  return pitchToFrequency(targetMidi)
}

const mapWave = (value: number): OscillatorType => waveTypes[value] ?? 'square'

const computePreviewParams = (patch: RawXdPatch): PreviewParams => {
  const view = new DataView(patch.progBin.buffer, patch.progBin.byteOffset, patch.progBin.byteLength)
  const keyboardOctave = readUint8(view, 16)
  const vco1Wave = readUint8(view, 22)
  const vco1Octave = readUint8(view, 23)
  const vco1Pitch = readUint16(view, 24)
  const vco1Level = readUint16(view, 54)

  const vco2Wave = readUint8(view, 28)
  const vco2Octave = readUint8(view, 29)
  const vco2Pitch = readUint16(view, 30)
  const vco2Level = readUint16(view, 56)

  const noiseLevel = readUint16(view, 58)
  const cutoff = readUint16(view, 60)
  const resonance = readUint16(view, 62)

  const envelope = createEnvelope(view)

  const baseNote = DEFAULT_NOTE + (DEFAULT_OCTAVE_OFFSETS[keyboardOctave] ?? 0) * 12

  const frequency1 = resolveFrequency(baseNote, vco1Octave, vco1Pitch)
  const frequency2 = resolveFrequency(baseNote, vco2Octave, vco2Pitch)

  const normalizedLevel1 = fraction(vco1Level)
  const normalizedLevel2 = fraction(vco2Level)
  const normalizedNoise = fraction(noiseLevel)

  const filterFrequency = 200 + Math.pow(fraction(cutoff), 2) * 8000
  const filterQ = 0.2 + fraction(resonance) * 9.8

  return {
    frequency1,
    frequency2: normalizedLevel2 > 0.01 ? frequency2 : null,
    level1: normalizedLevel1,
    level2: normalizedLevel2,
    wave1: mapWave(vco1Wave),
    wave2: mapWave(vco2Wave),
    noiseLevel: normalizedNoise,
    envelope,
    filterFrequency,
    filterQ,
  }
}

const stopSource = (source: AudioScheduledSourceNode | null, stopTime: number) => {
  if (!source) return
  try {
    source.stop(stopTime)
  } catch {
    // Ignore errors when the source is already stopped.
  }
}

export const playPatchPreview = async (
  patch: RawXdPatch,
  options: { durationSeconds?: number } = {},
): Promise<PatchPreviewHandle> => {
  const context = await ensureAudioContext()
  const params = computePreviewParams(patch)
  const now = context.currentTime
  const duration = Math.max(1.5, options.durationSeconds ?? DEFAULT_DURATION)

  const mixGain = context.createGain()
  mixGain.gain.setValueAtTime(1, now)

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setTargetAtTime(params.filterFrequency, now, 0.01)
  filter.Q.setTargetAtTime(params.filterQ, now, 0.01)
  mixGain.connect(filter)

  const envelopeGain = context.createGain()
  envelopeGain.gain.setValueAtTime(0, now)
  filter.connect(envelopeGain)

  const finalGain = context.createGain()
  const headroom = 0.4
  finalGain.gain.setValueAtTime(headroom, now)
  envelopeGain.connect(finalGain)
  finalGain.connect(context.destination)

  const { attack, decay, sustain, release } = params.envelope
  const peakGain = Math.max(0.05, params.level1 + params.level2 * 0.8)
  const sustainGain = Math.max(0.02, peakGain * sustain)

  const holdTime = Math.max(0.2, duration - attack - decay - release)
  const sustainStart = now + attack + decay
  const noteOff = sustainStart + holdTime
  const releaseEnd = noteOff + release

  cancelParamScheduling(envelopeGain.gain, now)
  envelopeGain.gain.linearRampToValueAtTime(peakGain, now + attack)
  envelopeGain.gain.linearRampToValueAtTime(sustainGain, sustainStart)
  envelopeGain.gain.setValueAtTime(sustainGain, noteOff)
  envelopeGain.gain.linearRampToValueAtTime(0.0001, releaseEnd)

  const sources: AudioScheduledSourceNode[] = []

  const osc1Gain = context.createGain()
  osc1Gain.gain.setValueAtTime(params.level1, now)
  osc1Gain.connect(mixGain)

  const osc1 = context.createOscillator()
  osc1.type = params.wave1
  osc1.frequency.setValueAtTime(params.frequency1, now)
  osc1.connect(osc1Gain)
  osc1.start(now)
  osc1.stop(releaseEnd + 0.05)
  sources.push(osc1)

  if (params.frequency2 && params.level2 > 0.01) {
    const osc2Gain = context.createGain()
    osc2Gain.gain.setValueAtTime(params.level2, now)
    osc2Gain.connect(mixGain)

    const osc2 = context.createOscillator()
    osc2.type = params.wave2
    osc2.frequency.setValueAtTime(params.frequency2, now)
    osc2.connect(osc2Gain)
    osc2.start(now)
    osc2.stop(releaseEnd + 0.05)
    sources.push(osc2)
  }

  let noiseSource: AudioBufferSourceNode | null = null
  if (params.noiseLevel > 0.01) {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = Math.random() * 2 - 1
    }
    noiseSource = context.createBufferSource()
    noiseSource.buffer = buffer
    noiseSource.loop = true
    const noiseGain = context.createGain()
    noiseGain.gain.setValueAtTime(params.noiseLevel * 0.2, now)
    noiseSource.connect(noiseGain)
    noiseGain.connect(mixGain)
    noiseSource.start(now)
    noiseSource.stop(releaseEnd + 0.05)
    sources.push(noiseSource)
  }

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    const stopAt = context.currentTime
    cancelParamScheduling(envelopeGain.gain, stopAt)
    envelopeGain.gain.linearRampToValueAtTime(0.0001, stopAt + Math.max(0.05, release / 3))
    sources.forEach((source) => stopSource(source, stopAt + 0.1))
  }

  const finished = new Promise<void>((resolve) => {
    let remaining = sources.length
    const handleEnded = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
      }
    }
    sources.forEach((source) => {
      const previous = source.onended
      source.onended = (event) => {
        previous?.call(source, event)
        handleEnded()
      }
    })
  })

  const disposeNodes = () => {
    try {
      finalGain.disconnect()
    } catch {
      // Ignore disconnect errors; the graph will be garbage collected.
    }
    try {
      envelopeGain.disconnect()
      filter.disconnect()
      mixGain.disconnect()
    } catch {
      // Ignore disconnect errors.
    }
  }

  finished.finally(disposeNodes)

  return { stop, finished }
}
