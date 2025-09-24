import { xdPatchFields } from '../data/xdPatchFields'
import type { RawXdPatch } from '../lib/minilogueXd'

const fieldMap = new Map(xdPatchFields.map((field) => [field.field, field]))

const textDecoder = new TextDecoder('utf-8')

const waveNames = ['Triangle', 'Saw', 'Square']
const multiNames = ['Noise', 'VPM', 'User']
const booleanNames = (value: number) => (value ? 'On' : 'Off')

const percentFields = new Set([
  'vco_1_pitch',
  'vco_1_shape',
  'vco_2_pitch',
  'vco_2_shape',
  'cross_mod_depth',
  'vco_1_level',
  'vco_2_level',
  'noise_level',
  'multi_level',
  'cutoff',
  'resonance',
  'amp_eg_attack',
  'amp_eg_decay',
  'amp_eg_sustain',
  'amp_eg_release',
  'eg_attack',
  'eg_decay',
  'delay_feedback',
  'shape_noise',
  'shape_vpm',
  'shape_user',
])

const readValue = (progBin: Uint8Array, key: string): number | string | null => {
  const meta = fieldMap.get(key)
  if (!meta) return null
  const view = new DataView(progBin.buffer, progBin.byteOffset, progBin.byteLength)
  switch (meta.format) {
    case 'B':
      return view.getUint8(meta.offset)
    case '<H':
      return view.getUint16(meta.offset, true)
    case '4s':
    case '12s': {
      const bytes = progBin.subarray(meta.offset, meta.offset + meta.length)
      return textDecoder.decode(bytes).replace(/\u0000.*$/, '').trim()
    }
    default:
      return null
  }
}

const formatPercent = (value: number, max = 1023) => `${Math.round((value / max) * 100)}% (${value})`

const readNumber = (progBin: Uint8Array, key: string): number => {
  const result = readValue(progBin, key)
  if (typeof result === 'number') return result
  return 0
}

const getMultiEngineSummary = (progBin: Uint8Array) => {
  const selects = [
    readNumber(progBin, 'select_noise'),
    readNumber(progBin, 'select_vpm'),
    readNumber(progBin, 'select_user'),
  ]
  const activeIndex = selects.findIndex((value) => value > 0)
  if (activeIndex === -1) return null

  const level = readNumber(progBin, 'multi_level')
  if (level === 0) return null

  const shapeKeys = ['shape_noise', 'shape_vpm', 'shape_user']
  const shape = readNumber(progBin, shapeKeys[activeIndex])
  const shiftShapeKeys = ['shift_shape_noise', 'shift_shape_vpm', 'shift_shape_user']
  const shift = readNumber(progBin, shiftShapeKeys[activeIndex])

  return {
    type: multiNames[activeIndex] ?? 'Multi',
    level: formatPercent(level),
    shape: formatPercent(shape),
    shift: shift ? formatPercent(shift) : undefined,
  }
}

const formatValue = (key: string, value: number | string | null) => {
  if (value == null) return '—'
  if (typeof value === 'string') return value || '—'
  if (percentFields.has(key)) {
    return formatPercent(value)
  }
  switch (key) {
    case 'vco_1_wave':
    case 'vco_2_wave':
      return waveNames[value] ?? String(value)
    case 'sync':
    case 'ring':
      return booleanNames(value)
    default:
      return String(value)
  }
}

export interface PatchSummaryCategory {
  label: string
  rows: Array<{ label: string; value: string }>
}

const categories: Array<{ label: string; fields: Array<{ key: string; label: string }> }> = [
  {
    label: 'Oscillator 1',
    fields: [
      { key: 'vco_1_wave', label: 'Wave' },
      { key: 'vco_1_octave', label: 'Octave' },
      { key: 'vco_1_pitch', label: 'Pitch' },
      { key: 'vco_1_shape', label: 'Shape' },
      { key: 'sync', label: 'Sync' },
      { key: 'ring', label: 'Ring' },
    ],
  },
  {
    label: 'Oscillator 2',
    fields: [
      { key: 'vco_2_wave', label: 'Wave' },
      { key: 'vco_2_octave', label: 'Octave' },
      { key: 'vco_2_pitch', label: 'Pitch' },
      { key: 'vco_2_shape', label: 'Shape' },
      { key: 'vco_2_level', label: 'Level' },
      { key: 'cross_mod_depth', label: 'Cross Mod' },
    ],
  },
  {
    label: 'Multi Engine',
    fields: [
      { key: 'multi_level', label: 'Level' },
    ],
  },
  {
    label: 'Mixer',
    fields: [
      { key: 'vco_1_level', label: 'VCO 1 Level' },
      { key: 'vco_2_level', label: 'VCO 2 Level' },
      { key: 'noise_level', label: 'Noise Level' },
    ],
  },
  {
    label: 'Filter',
    fields: [
      { key: 'cutoff', label: 'Cutoff' },
      { key: 'resonance', label: 'Resonance' },
    ],
  },
  {
    label: 'Amp Envelope',
    fields: [
      { key: 'amp_eg_attack', label: 'Attack' },
      { key: 'amp_eg_decay', label: 'Decay' },
      { key: 'amp_eg_sustain', label: 'Sustain' },
      { key: 'amp_eg_release', label: 'Release' },
    ],
  },
  {
    label: 'EG / Mod',
    fields: [
      { key: 'eg_attack', label: 'EG Attack' },
      { key: 'eg_decay', label: 'EG Decay' },
      { key: 'delay_feedback', label: 'Delay Feedback' },
    ],
  },
]

export const getPatchSummary = (patch: RawXdPatch): PatchSummaryCategory[] => {
  const progBin = patch.progBin
  const multiSummary = getMultiEngineSummary(progBin)

  return categories
    .map((category) => ({
      label: category.label,
      rows: category.fields
        .map((item) => ({
          label: item.label,
          value: formatValue(item.key, readValue(progBin, item.key)),
        }))
        .filter((row) => row.value !== '—' && row.value !== '0% (0)'),
    }))
    .filter((category) => category.rows.length > 0)
    .map((category) => {
      if (category.label === 'Multi Engine' && multiSummary) {
        return {
          label: category.label,
          rows: [
            { label: 'Type', value: multiSummary.type },
            { label: 'Level', value: multiSummary.level },
            { label: 'Shape', value: multiSummary.shape },
            ...(multiSummary.shift ? [{ label: 'Shift Shape', value: multiSummary.shift }] : []),
          ],
        }
      }
      if (category.label === 'Multi Engine' && !multiSummary) {
        return { ...category, rows: [] }
      }
      return category
    })
    .filter((category) => category.rows.length > 0)
}
