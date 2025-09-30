import { xdPatchSchema } from '../data/xdPatchSchema'
import type { RawXdPatch } from '../lib/minilogueXd'

type NumericFormat = '<H' | 'B'

type SchemaField = {
  field: string
  offset: number
  format: NumericFormat | '4s' | '12s'
  length: number
}

const schemaFieldMap = new Map<string, SchemaField>(xdPatchSchema.map((field) => [field.field, field]))

const DEFAULT_MAX_BY_FORMAT: Record<NumericFormat, number> = {
  '<H': 1023,
  B: 127,
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const percentDisplay = (raw: number, max: number) => `${Math.round((raw / max) * 100)}%`

export interface PanelValue {
  raw: number
  max: number
  normalized: number
  display: string
}

export interface DiscreteValue {
  raw: number
  label: string
  options: string[]
}

export interface SwitchValue {
  label: string
  active: boolean
}

export interface OscillatorPanelData {
  wave: DiscreteValue
  octave: DiscreteValue
  pitch: PanelValue | null
  shape: PanelValue | null
  level?: PanelValue | null
  sync?: SwitchValue
  ring?: SwitchValue
  crossMod?: PanelValue | null
}

export interface MultiPanelData {
  mode: DiscreteValue
  variant?: string
  level: PanelValue | null
  shape?: PanelValue | null
  shift?: PanelValue | null
}

export interface MixerPanelData {
  vco1: PanelValue | null
  vco2: PanelValue | null
  multi: PanelValue | null
}

export interface FilterPanelData {
  cutoff: PanelValue | null
  resonance: PanelValue | null
  drive: PanelValue | null
  keyTrack: PanelValue | null
}

export interface EnvelopePanelData {
  attack: PanelValue | null
  decay: PanelValue | null
  sustain?: PanelValue | null
  release?: PanelValue | null
  intensity?: PanelValue | null
  target?: DiscreteValue
}

export interface LfoPanelData {
  wave: DiscreteValue
  mode: DiscreteValue
  rate: PanelValue | null
  intensity: PanelValue | null
  target: DiscreteValue
}

export interface EffectPanelData {
  on: boolean
  type?: DiscreteValue
  time: PanelValue | null
  depth: PanelValue | null
}

export interface VoicePanelData {
  mode: DiscreteValue
  depth: PanelValue | null
  portamento: PanelValue | null
}

export interface PatchPanelData {
  voice: VoicePanelData
  vco1: OscillatorPanelData
  vco2: OscillatorPanelData
  multi: MultiPanelData
  mixer: MixerPanelData
  filter: FilterPanelData
  ampEg: EnvelopePanelData
  eg: EnvelopePanelData
  lfo: LfoPanelData
  modFx: EffectPanelData
  delay: EffectPanelData
  reverb: EffectPanelData
}

const VOICE_MODE_LABELS = ['Poly', 'Unison', 'Chord', 'Arp', 'Multi']
const WAVE_LABELS = ['Saw', 'Triangle', 'Square']
const OCTAVE_LABELS = ['-2', '-1', '0', '+1', '+2']
const MULTI_MODE_LABELS = ['Noise', 'VPM', 'User']
const MULTI_NOISE_VARIANTS = ['High', 'Low', 'Peak', 'Decim']
const MULTI_VPM_VARIANTS = [
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
const LFO_WAVE_LABELS = ['Saw', 'Triangle', 'Square']
const LFO_MODE_LABELS = ['1-Shot', 'Normal', 'BPM']
const LFO_TARGET_LABELS = ['Pitch', 'Shape', 'Cutoff']
const EG_TARGET_LABELS = ['Cutoff', 'Pitch 2', 'Pitch']
const MOD_FX_TYPE_LABELS = ['Chorus', 'Ensemble', 'Phaser', 'Flanger', 'User']

const getSchemaField = (key: string): SchemaField | undefined => schemaFieldMap.get(key)

const createDataView = (patch: RawXdPatch) =>
  new DataView(patch.progBin.buffer, patch.progBin.byteOffset, patch.progBin.byteLength)

const readNumericField = (view: DataView, key: string): number | null => {
  const schema = getSchemaField(key)
  if (!schema) return null
  if (schema.offset + schema.length > view.byteLength) return null
  switch (schema.format) {
    case 'B':
      return view.getUint8(schema.offset)
    case '<H':
      return view.getUint16(schema.offset, true)
    default:
      return null
  }
}

const createPanelValue = (raw: number | null, max: number): PanelValue | null => {
  if (raw == null) return null
  const normalized = max > 0 ? clamp01(raw / max) : 0
  return {
    raw,
    max,
    normalized,
    display: percentDisplay(raw, max),
  }
}

const createValueFromField = (
  view: DataView,
  key: string,
  explicitMax?: number,
): PanelValue | null => {
  const schema = getSchemaField(key)
  if (!schema) return null
  const raw = readNumericField(view, key)
  if (raw == null) return null
  const max = explicitMax ?? (schema.format === 'B' || schema.format === '<H' ? DEFAULT_MAX_BY_FORMAT[schema.format] : 1023)
  return createPanelValue(raw, max)
}

const createDiscrete = (raw: number | null, options: string[]): DiscreteValue => ({
  raw: raw ?? -1,
  label: raw != null && raw >= 0 && options[raw] ? options[raw] : '—',
  options,
})

const createBooleanLabel = (label: string, active: boolean): SwitchValue => ({ label, active })

export const getPatchPanelData = (patch: RawXdPatch): PatchPanelData => {
  const view = createDataView(patch)

  const voiceModeRaw = readNumericField(view, 'voice_mode_type') ?? 0
  const voiceMode = createDiscrete(voiceModeRaw, VOICE_MODE_LABELS)
  const voiceModeDepth = createValueFromField(view, 'voice_mode_depth')
  const portamento = createValueFromField(view, 'portamento', DEFAULT_MAX_BY_FORMAT.B)

  const vco1Wave = createDiscrete(readNumericField(view, 'vco_1_wave'), WAVE_LABELS)
  const vco1Octave = createDiscrete(readNumericField(view, 'vco_1_octave'), OCTAVE_LABELS)
  const vco1Pitch = createValueFromField(view, 'vco_1_pitch')
  const vco1Shape = createValueFromField(view, 'vco_1_shape')
  const vco1Level = createValueFromField(view, 'vco_1_level')

  const vco2Wave = createDiscrete(readNumericField(view, 'vco_2_wave'), WAVE_LABELS)
  const vco2Octave = createDiscrete(readNumericField(view, 'vco_2_octave'), OCTAVE_LABELS)
  const vco2Pitch = createValueFromField(view, 'vco_2_pitch')
  const vco2Shape = createValueFromField(view, 'vco_2_shape')
  const vco2Level = createValueFromField(view, 'vco_2_level')
  const crossMod = createValueFromField(view, 'cross_mod_depth')

  const syncSwitch = createBooleanLabel('Sync', Boolean(readNumericField(view, 'sync')))
  const ringSwitch = createBooleanLabel('Ring', Boolean(readNumericField(view, 'ring')))

  const multiTypeRaw = readNumericField(view, 'multi_type') ?? 0
  const multiMode = createDiscrete(multiTypeRaw, MULTI_MODE_LABELS)
  let multiVariant: string | undefined
  let multiShape: PanelValue | null = null
  let multiShift: PanelValue | null = null
  switch (multiTypeRaw) {
    case 0: {
      const index = readNumericField(view, 'select_noise') ?? 0
      multiVariant = MULTI_NOISE_VARIANTS[index] ?? `Noise ${index + 1}`
      multiShape = createValueFromField(view, 'shape_noise')
      multiShift = createValueFromField(view, 'shift_shape_noise')
      break
    }
    case 1: {
      const index = readNumericField(view, 'select_vpm') ?? 0
      multiVariant = MULTI_VPM_VARIANTS[index] ?? `VPM ${index + 1}`
      multiShape = createValueFromField(view, 'shape_vpm')
      multiShift = createValueFromField(view, 'shift_shape_vpm')
      break
    }
    case 2: {
      const slot = readNumericField(view, 'select_user') ?? 0
      const assignment = patch.userAssignments?.oscillator
      if (assignment?.name) {
        multiVariant = assignment.slot != null ? `${assignment.name} (Slot ${assignment.slot + 1})` : assignment.name
      } else if (assignment?.path) {
        multiVariant = assignment.slot != null ? `${assignment.path} (Slot ${assignment.slot + 1})` : assignment.path
      } else {
        multiVariant = `Slot ${slot + 1}`
      }
      multiShape = createValueFromField(view, 'shape_user')
      multiShift = createValueFromField(view, 'shift_shape_user')
      break
    }
    default:
      break
  }

  const multiLevel = createValueFromField(view, 'multi_level')

  const mixer: MixerPanelData = {
    vco1: vco1Level,
    vco2: vco2Level,
    multi: multiLevel,
  }

  const filter: FilterPanelData = {
    cutoff: createValueFromField(view, 'cutoff'),
    resonance: createValueFromField(view, 'resonance'),
    drive: createValueFromField(view, 'cutoff_drive', DEFAULT_MAX_BY_FORMAT.B),
    keyTrack: createValueFromField(view, 'cutoff_keyboard_track', DEFAULT_MAX_BY_FORMAT.B),
  }

  const ampEg: EnvelopePanelData = {
    attack: createValueFromField(view, 'amp_eg_attack'),
    decay: createValueFromField(view, 'amp_eg_decay'),
    sustain: createValueFromField(view, 'amp_eg_sustain'),
    release: createValueFromField(view, 'amp_eg_release'),
  }

  const egTarget = createDiscrete(readNumericField(view, 'eg_target'), EG_TARGET_LABELS)

  const eg: EnvelopePanelData = {
    attack: createValueFromField(view, 'eg_attack'),
    decay: createValueFromField(view, 'eg_decay'),
    intensity: createValueFromField(view, 'eg_int'),
    target: egTarget,
  }

  const lfo: LfoPanelData = {
    wave: createDiscrete(readNumericField(view, 'lfo_wave'), LFO_WAVE_LABELS),
    mode: createDiscrete(readNumericField(view, 'lfo_mode'), LFO_MODE_LABELS),
    rate: createValueFromField(view, 'lfo_rate'),
    intensity: createValueFromField(view, 'lfo_int'),
    target: createDiscrete(readNumericField(view, 'lfo_target'), LFO_TARGET_LABELS),
  }

  const modFxType = createDiscrete(readNumericField(view, 'mod_fx_type'), MOD_FX_TYPE_LABELS)
  const modFx: EffectPanelData = {
    on: Boolean(readNumericField(view, 'mod_fx_on_off')),
    type: modFxType,
    time: createValueFromField(view, 'mod_fx_time'),
    depth: createValueFromField(view, 'mod_fx_depth'),
  }

  const delay: EffectPanelData = {
    on: Boolean(readNumericField(view, 'delay_on_off')),
    time: createValueFromField(view, 'delay_time'),
    depth: createValueFromField(view, 'delay_depth'),
  }

  const reverb: EffectPanelData = {
    on: Boolean(readNumericField(view, 'reverb_on_off')),
    time: createValueFromField(view, 'reverb_time'),
    depth: createValueFromField(view, 'reverb_depth'),
  }

  return {
    voice: {
      mode: voiceMode,
      depth: voiceModeDepth,
      portamento,
    },
    vco1: {
      wave: vco1Wave,
      octave: vco1Octave,
      pitch: vco1Pitch,
      shape: vco1Shape,
      level: vco1Level,
      sync: syncSwitch,
    },
    vco2: {
      wave: vco2Wave,
      octave: vco2Octave,
      pitch: vco2Pitch,
      shape: vco2Shape,
      level: vco2Level,
      ring: ringSwitch,
      crossMod,
    },
    multi: {
      mode: multiMode,
      variant: multiVariant,
      level: multiLevel,
      shape: multiShape,
      shift: multiShift,
    },
    mixer,
    filter,
    ampEg,
    eg,
    lfo,
    modFx,
    delay,
    reverb,
  }
}
