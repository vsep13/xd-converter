import { xdPatchFields } from '../data/xdPatchFields'
import type { RawXdPatch } from '../lib/minilogueXd'

const multiNoiseTypes = ['High', 'Low', 'Peak', 'Decim']
const multiVpmTypes = [
  'Sin 1',
  'Sin 2',
  'Sin 3',
  'Sin 4',
  'Saw 1',
  'Saw 2',
  'Square 1',
  'Square 2',
  'Fat 1',
  'Fat 2',
  'Air 1',
  'Air 2',
  'Decay 1',
  'Decay 2',
  'Creep',
  'Throat',
]

const MULTI_TYPE_OFFSET = 38
const SELECT_NOISE_OFFSET = 39
const SELECT_VPM_OFFSET = 40
const SELECT_USER_OFFSET = 41
const SHAPE_NOISE_OFFSET = 42
const SHAPE_VPM_OFFSET = 44
const SHAPE_USER_OFFSET = 46
const SHIFT_SHAPE_NOISE_OFFSET = 48
const SHIFT_SHAPE_VPM_OFFSET = 50
const SHIFT_SHAPE_USER_OFFSET = 52
const MULTI_LEVEL_OFFSET = 58

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
  'user_param1',
  'user_param2',
  'user_param3',
  'user_param4',
  'user_param5',
  'user_param6',
])

const getPercentMax = (key: string) => {
  const meta = fieldMap.get(key)
  if (!meta) return 1023
  switch (meta.format) {
    case 'B':
      return 127
    case '<H':
      return 1023
    default:
      return 1023
  }
}

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
      const decoded = textDecoder.decode(bytes)
      const nullIndex = decoded.indexOf('\u0000')
      const safe = nullIndex === -1 ? decoded : decoded.slice(0, nullIndex)
      return safe.trim()
    }
    default:
      return null
  }
}

const formatPercent = (value: number, max = 1023) => `${Math.round((value / max) * 100)}% (${value})`

type MultiEngineSummary = {
  mode: string
  variant?: string
  level: { raw: number; max: number }
  shape?: { label: string; raw: number; max: number }
  shift?: { label: string; raw: number; max: number }
  params: Array<{ label: string; raw: number; max: number }>
}

const getMultiEngineSummary = (patch: RawXdPatch): MultiEngineSummary | null => {
  const progBin = patch.progBin
  if (progBin.length <= MULTI_LEVEL_OFFSET) return null

  const view = new DataView(progBin.buffer, progBin.byteOffset, progBin.byteLength)
  const multiType = view.getUint8(MULTI_TYPE_OFFSET)
  const level = view.getUint16(MULTI_LEVEL_OFFSET, true)

  const summary: MultiEngineSummary = {
    mode: multiNames[multiType] ?? 'Multi',
    level: { raw: level, max: 1023 },
    params: [],
  }

  switch (multiType) {
    case 0: {
      const index = view.getUint8(SELECT_NOISE_OFFSET)
      summary.variant = multiNoiseTypes[index] ?? `Noise ${index + 1}`
      summary.shape = { label: 'Shape', raw: view.getUint16(SHAPE_NOISE_OFFSET, true), max: 1023 }
      summary.shift = { label: 'Shift', raw: view.getUint16(SHIFT_SHAPE_NOISE_OFFSET, true), max: 1023 }
      break
    }
    case 1: {
      const index = view.getUint8(SELECT_VPM_OFFSET)
      summary.variant = multiVpmTypes[index] ?? `VPM ${index + 1}`
      summary.shape = { label: 'Shape', raw: view.getUint16(SHAPE_VPM_OFFSET, true), max: 1023 }
      summary.shift = { label: 'Shape Mod', raw: view.getUint16(SHIFT_SHAPE_VPM_OFFSET, true), max: 1023 }
      const vpmParams: Array<{ label: string; offset: number }> = [
        { label: 'Feedback', offset: 136 },
        { label: 'Noise Depth', offset: 137 },
        { label: 'Shape Mod Int', offset: 138 },
        { label: 'Mod Attack', offset: 139 },
        { label: 'Mod Decay', offset: 140 },
        { label: 'Key Track', offset: 141 },
      ]
      summary.params = vpmParams.map(({ label, offset }) => ({ label, raw: view.getUint8(offset), max: 127 }))
      break
    }
    case 2: {
      const slot = view.getUint8(SELECT_USER_OFFSET)
      const assignment = patch.userAssignments?.oscillator
      const slotLabel = `Slot ${slot + 1}`
      if (assignment?.name) {
        summary.variant = assignment.slot != null ? `${assignment.name} (Slot ${assignment.slot + 1})` : assignment.name
      } else if (assignment?.path) {
        summary.variant = assignment.slot != null ? `${assignment.path} (Slot ${assignment.slot + 1})` : assignment.path
      } else {
        summary.variant = slotLabel
      }
      summary.shape = { label: 'Shape', raw: view.getUint16(SHAPE_USER_OFFSET, true), max: 1023 }
      summary.shift = { label: 'Shift', raw: view.getUint16(SHIFT_SHAPE_USER_OFFSET, true), max: 1023 }
      const userParams: Array<{ label: string; offset: number }> = [
        { label: 'Param 1', offset: 142 },
        { label: 'Param 2', offset: 143 },
        { label: 'Param 3', offset: 144 },
        { label: 'Param 4', offset: 145 },
        { label: 'Param 5', offset: 146 },
        { label: 'Param 6', offset: 147 },
      ]
      summary.params = userParams.map(({ label, offset }) => ({ label, raw: view.getUint8(offset), max: 127 }))
      break
    }
    default: {
      summary.shape = { label: 'Shape', raw: view.getUint16(SHAPE_NOISE_OFFSET, true), max: 1023 }
      summary.shift = { label: 'Shift', raw: view.getUint16(SHIFT_SHAPE_NOISE_OFFSET, true), max: 1023 }
    }
  }

  return summary
}

const formatValue = (key: string, value: number | string | null) => {
  if (value == null) return '—'
  if (typeof value === 'string') return value || '—'
  if (percentFields.has(key)) {
    return formatPercent(value, getPercentMax(key))
  }
  switch (key) {
    case 'voice_mode_type': {
      const modes = ['Poly', 'Unison', 'Chord', 'Arp', 'Multi']
      return modes[value] ?? String(value)
    }
    case 'voice_mode_depth':
      return formatPercent(value, getPercentMax(key))
    case 'keyboard_octave': {
      const labels = ['-2', '-1', '0', '+1', '+2']
      return labels[value] ?? String(value)
    }
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

export interface PatchSummaryRow {
  label: string
  value: string
  rawValue?: number | string | null
  normalizedValue?: number
}

export interface PatchSummaryCategory {
  label: string
  rows: PatchSummaryRow[]
}

const categories: Array<{
  label: string
  fields: Array<{ key: string; label: string }>
}> = [
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
    fields: [],
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

const createRow = (progBin: Uint8Array, key: string, label: string): PatchSummaryRow | null => {
  const rawValue = readValue(progBin, key)
  const displayValue = formatValue(key, rawValue)
  if (displayValue === '—' || displayValue === '0% (0)') return null

  if (typeof rawValue === 'number' && percentFields.has(key)) {
    const max = getPercentMax(key)
    const normalized = Math.max(0, Math.min(1, rawValue / max))
    return { label, value: displayValue, rawValue, normalizedValue: normalized }
  }

  return { label, value: displayValue, rawValue }
}

const createPercentRow = (
  label: string,
  rawValue: number,
  max: number,
): PatchSummaryRow => ({
  label,
  value: formatPercent(rawValue, max),
  rawValue,
  normalizedValue: Math.max(0, Math.min(1, rawValue / max)),
})

export const getPatchSummary = (patch: RawXdPatch): PatchSummaryCategory[] => {
  const progBin = patch.progBin
  const multiSummary = getMultiEngineSummary(patch)

  const baseCategories = categories.map((category) => ({
    label: category.label,
    rows: category.fields
      .map((item) => createRow(progBin, item.key, item.label))
      .filter((row): row is PatchSummaryRow => Boolean(row)),
  }))

  const results: PatchSummaryCategory[] = []

  if (progBin.length > 22) {
    const view = new DataView(progBin.buffer, progBin.byteOffset, progBin.byteLength)
    const modeType = view.getUint8(21)
    const depthValue = view.getUint16(19, true)
    const keyboardOct = view.getUint8(16)

    const modeLabels = ['Poly', 'Unison', 'Chord', 'Arp', 'Multi']
    const modeRows: PatchSummaryRow[] = [{ label: 'Mode', value: modeLabels[modeType] ?? `Mode ${modeType}` }]

    const octaveLabels = ['-2', '-1', '0', '+1', '+2']
    if (keyboardOct < octaveLabels.length) {
      modeRows.push({ label: 'Keyboard Oct', value: octaveLabels[keyboardOct] })
    }

    if (modeType === 2) {
      const chordTypes = [
        'Mono',
        'Poly',
        'Unison',
        'Octave',
        'Fifth',
        'Sus4',
        'Major',
        'Minor',
        'Dim',
        'Maj7',
        'Min7',
        'Dominant7',
        '9th',
        'Min9',
        'Sus2',
        'Sixth',
      ]
      const chordIndex = Math.min(chordTypes.length - 1, Math.round(depthValue / 64))
      modeRows.push({ label: 'Chord', value: chordTypes[chordIndex] ?? `Type ${chordIndex}` })
    } else if (modeType === 1 || modeType === 4) {
      if (depthValue > 0) {
        modeRows.push(createPercentRow('Depth', depthValue, 1023))
      }
    } else if (modeType === 3) {
      if (depthValue > 0) {
        modeRows.push(createPercentRow('Arp Depth', depthValue, 1023))
      }
    }

    results.push({ label: 'Voice Mode', rows: modeRows })
  }

  baseCategories.forEach((category) => {
    if (category.label === 'Multi Engine') {
      if (!multiSummary) return

      const rows: PatchSummaryRow[] = [{ label: 'Mode', value: multiSummary.mode }]
      if (multiSummary.variant) {
        rows.push({ label: multiSummary.mode === 'User' ? 'Oscillator' : 'Variant', value: multiSummary.variant })
      }
      rows.push(createPercentRow('Level', multiSummary.level.raw, multiSummary.level.max))
      if (multiSummary.shape) {
        rows.push(createPercentRow(multiSummary.shape.label, multiSummary.shape.raw, multiSummary.shape.max))
      }
      if (multiSummary.shift) {
        rows.push(createPercentRow(multiSummary.shift.label, multiSummary.shift.raw, multiSummary.shift.max))
      }
      multiSummary.params.forEach((param) => {
        rows.push(createPercentRow(param.label, param.raw, param.max))
      })
      results.push({ label: 'Oscillator 3', rows })
    } else if (category.rows.length) {
      results.push(category)
    }
  })

  return results
}
