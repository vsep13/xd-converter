import { xdPatchFields, type XdPatchField } from '../data/xdPatchFields'
import { createPatchHash, type RawXdPatch } from '../lib/minilogueXd'

export type RandomizerRange = {
  enabled: boolean
  min: number
  max: number
}

export type RandomizerConfig = Record<string, RandomizerRange>

export type RandomizerField = {
  key: string
  label: string
  max: number
}

export type RandomizerGroup = {
  id: string
  label: string
  fields: RandomizerField[]
}

const fieldMeta = new Map<string, XdPatchField>(xdPatchFields.map((field) => [field.field, field]))

const percentMax = 1023

export const RANDOMIZER_GROUPS: RandomizerGroup[] = [
  {
    id: 'oscillator-1',
    label: 'Oscillator 1',
    fields: [
      { key: 'vco_1_pitch', label: 'Pitch', max: percentMax },
      { key: 'vco_1_shape', label: 'Shape', max: percentMax },
    ],
  },
  {
    id: 'oscillator-2',
    label: 'Oscillator 2',
    fields: [
      { key: 'vco_2_pitch', label: 'Pitch', max: percentMax },
      { key: 'vco_2_shape', label: 'Shape', max: percentMax },
      { key: 'cross_mod_depth', label: 'Cross modulation', max: percentMax },
    ],
  },
  {
    id: 'mixer',
    label: 'Mixer',
    fields: [
      { key: 'vco_1_level', label: 'VCO 1 level', max: percentMax },
      { key: 'vco_2_level', label: 'VCO 2 level', max: percentMax },
      { key: 'noise_level', label: 'Noise level', max: percentMax },
    ],
  },
  {
    id: 'filter',
    label: 'Filter',
    fields: [
      { key: 'cutoff', label: 'Cutoff', max: percentMax },
      { key: 'resonance', label: 'Resonance', max: percentMax },
    ],
  },
  {
    id: 'amp-envelope',
    label: 'Amp envelope',
    fields: [
      { key: 'amp_eg_attack', label: 'Attack', max: percentMax },
      { key: 'amp_eg_decay', label: 'Decay', max: percentMax },
      { key: 'amp_eg_sustain', label: 'Sustain', max: percentMax },
      { key: 'amp_eg_release', label: 'Release', max: percentMax },
    ],
  },
  {
    id: 'eg-mod',
    label: 'EG / Mod',
    fields: [
      { key: 'eg_attack', label: 'EG attack', max: percentMax },
      { key: 'eg_decay', label: 'EG decay', max: percentMax },
      { key: 'delay_feedback', label: 'Delay feedback', max: percentMax },
    ],
  },
]

const randomizerFieldMap = new Map<string, RandomizerField>()
RANDOMIZER_GROUPS.forEach((group) => {
  group.fields.forEach((field) => {
    randomizerFieldMap.set(field.key, field)
  })
})

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

const clampRange = (range: RandomizerRange): RandomizerRange => {
  const min = clampPercent(range.min)
  const max = clampPercent(range.max)
  return {
    enabled: range.enabled,
    min: Math.min(min, max),
    max: Math.max(min, max),
  }
}

const randomBetween = (min: number, max: number) => {
  if (max <= min) return min
  const span = max - min + 1
  return min + Math.floor(Math.random() * span)
}

const setFieldValue = (buffer: Uint8Array, field: XdPatchField, value: number) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  switch (field.format) {
    case '<H':
      view.setUint16(field.offset, value, true)
      break
    case 'B':
      view.setUint8(field.offset, value)
      break
    default:
      break
  }
}

export const createDefaultRandomizerConfig = (): RandomizerConfig => {
  const config: RandomizerConfig = {}
  RANDOMIZER_GROUPS.forEach((group) => {
    group.fields.forEach((field) => {
      config[field.key] = { enabled: true, min: 0, max: 100 }
    })
  })
  return config
}

export const normalizeRandomizerConfig = (input: RandomizerConfig): RandomizerConfig => {
  const config: RandomizerConfig = {}
  RANDOMIZER_GROUPS.forEach((group) => {
    group.fields.forEach((field) => {
      const current = input[field.key]
      config[field.key] = current ? clampRange(current) : { enabled: true, min: 0, max: 100 }
    })
  })
  return config
}

export const randomizePatchParameters = (patch: RawXdPatch, config: RandomizerConfig): RawXdPatch => {
  const nextBin = new Uint8Array(patch.progBin)
  let mutated = false

  RANDOMIZER_GROUPS.forEach((group) => {
    group.fields.forEach((field) => {
      const settings = clampRange(config[field.key] ?? { enabled: true, min: 0, max: 100 })
      if (!settings.enabled) return
      const meta = fieldMeta.get(field.key)
      if (!meta) return
      const rawMin = Math.round((settings.min / 100) * field.max)
      const rawMax = Math.round((settings.max / 100) * field.max)
      const value = randomBetween(Math.min(rawMin, rawMax), Math.max(rawMin, rawMax))
      setFieldValue(nextBin, meta, value)
      mutated = true
    })
  })

  if (!mutated) return patch

  const hash = createPatchHash(nextBin)

  return {
    ...patch,
    progBin: nextBin,
    hash,
    status: 'normal',
  }
}

export const getRandomizerFieldValue = (patch: RawXdPatch, key: string): { raw: number; percent: number } | null => {
  const field = randomizerFieldMap.get(key)
  if (!field) return null
  const meta = fieldMeta.get(key)
  if (!meta) return null
  const view = new DataView(patch.progBin.buffer, patch.progBin.byteOffset, patch.progBin.byteLength)
  let raw = 0
  switch (meta.format) {
    case '<H':
      raw = view.getUint16(meta.offset, true)
      break
    case 'B':
      raw = view.getUint8(meta.offset)
      break
    default:
      return null
  }
  return {
    raw,
    percent: field.max > 0 ? Math.round((raw / field.max) * 100) : 0,
  }
}
