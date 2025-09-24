export interface XdPatchField {
  field: string
  offset: number
  format: string
  length: number
  source: string
}

export const xdPatchFields: XdPatchField[] = [
  {
    "field": "str_PROG",
    "offset": 0,
    "format": "4s",
    "length": 4,
    "source": "str_PROG"
  },
  {
    "field": "program_name",
    "offset": 4,
    "format": "12s",
    "length": 12,
    "source": "program_name"
  },
  {
    "field": "keyboard_octave",
    "offset": 16,
    "format": "B",
    "length": 1,
    "source": "octave"
  },
  {
    "field": "vco_1_wave",
    "offset": 22,
    "format": "B",
    "length": 1,
    "source": "vco_1_wave"
  },
  {
    "field": "vco_1_octave",
    "offset": 23,
    "format": "B",
    "length": 1,
    "source": "vco_1_octave"
  },
  {
    "field": "vco_1_pitch",
    "offset": 24,
    "format": "<H",
    "length": 2,
    "source": "vco_1_pitch"
  },
  {
    "field": "vco_1_shape",
    "offset": 26,
    "format": "<H",
    "length": 2,
    "source": "vco_1_shape"
  },
  {
    "field": "vco_2_wave",
    "offset": 28,
    "format": "B",
    "length": 1,
    "source": "vco_2_wave"
  },
  {
    "field": "vco_2_octave",
    "offset": 29,
    "format": "B",
    "length": 1,
    "source": "vco_2_octave"
  },
  {
    "field": "vco_2_pitch",
    "offset": 30,
    "format": "<H",
    "length": 2,
    "source": "vco_2_pitch"
  },
  {
    "field": "vco_2_shape",
    "offset": 32,
    "format": "<H",
    "length": 2,
    "source": "vco_2_shape"
  },
  {
    "field": "sync",
    "offset": 34,
    "format": "B",
    "length": 1,
    "source": "sync"
  },
  {
    "field": "ring",
    "offset": 35,
    "format": "B",
    "length": 1,
    "source": "ring"
  },
  {
    "field": "cross_mod_depth",
    "offset": 36,
    "format": "<H",
    "length": 2,
    "source": "cross_mod_depth"
  },
  {
    "field": "vco_1_level",
    "offset": 54,
    "format": "<H",
    "length": 2,
    "source": "vco_1_level"
  },
  {
    "field": "vco_2_level",
    "offset": 56,
    "format": "<H",
    "length": 2,
    "source": "vco_2_level"
  },
  {
    "field": "noise_level",
    "offset": 58,
    "format": "<H",
    "length": 2,
    "source": "multi_level"
  },
  {
    "field": "cutoff",
    "offset": 60,
    "format": "<H",
    "length": 2,
    "source": "cutoff"
  },
  {
    "field": "resonance",
    "offset": 62,
    "format": "<H",
    "length": 2,
    "source": "resonance"
  },
  {
    "field": "amp_eg_attack",
    "offset": 66,
    "format": "<H",
    "length": 2,
    "source": "amp_eg_attack"
  },
  {
    "field": "amp_eg_decay",
    "offset": 68,
    "format": "<H",
    "length": 2,
    "source": "amp_eg_decay"
  },
  {
    "field": "amp_eg_sustain",
    "offset": 70,
    "format": "<H",
    "length": 2,
    "source": "amp_eg_sustain"
  },
  {
    "field": "amp_eg_release",
    "offset": 72,
    "format": "<H",
    "length": 2,
    "source": "amp_eg_release"
  },
  {
    "field": "eg_attack",
    "offset": 74,
    "format": "<H",
    "length": 2,
    "source": "eg_attack"
  },
  {
    "field": "eg_decay",
    "offset": 76,
    "format": "<H",
    "length": 2,
    "source": "eg_decay"
  },
  {
    "field": "delay_feedback",
    "offset": 103,
    "format": "<H",
    "length": 2,
    "source": "delay_depth"
  },
  {
    "field": "bend_range_plus",
    "offset": 111,
    "format": "B",
    "length": 1,
    "source": "bend_range_plus"
  },
  {
    "field": "bend_range_minus",
    "offset": 112,
    "format": "B",
    "length": 1,
    "source": "bend_range_minus"
  },
  {
    "field": "lfo_key_sync",
    "offset": 125,
    "format": "B",
    "length": 1,
    "source": "lfo_key_sync"
  },
  {
    "field": "lfo_voice_sync",
    "offset": 126,
    "format": "B",
    "length": 1,
    "source": "lfo_voice_sync"
  },
  {
    "field": "amp_velocity",
    "offset": 129,
    "format": "B",
    "length": 1,
    "source": "amp_velocity"
  },
  {
    "field": "portamento_mode",
    "offset": 133,
    "format": "B",
    "length": 1,
    "source": "portamento_mode"
  },
  {
    "field": "portamento_bpm",
    "offset": 134,
    "format": "B",
    "length": 1,
    "source": "portamento_bpm_sync"
  },
  {
    "field": "bpm",
    "offset": 164,
    "format": "<H",
    "length": 2,
    "source": "bpm"
  },
  {
    "field": "step_length",
    "offset": 166,
    "format": "B",
    "length": 1,
    "source": "step_length"
  },
  {
    "field": "step_resolution",
    "offset": 167,
    "format": "B",
    "length": 1,
    "source": "step_resolution"
  },
  {
    "field": "default_gate_time",
    "offset": 169,
    "format": "B",
    "length": 1,
    "source": "default_gate_time"
  },
  {
    "field": "step1_16",
    "offset": 170,
    "format": "<H",
    "length": 2,
    "source": "step1_16"
  },
  {
    "field": "step1_16_switch",
    "offset": 172,
    "format": "<H",
    "length": 2,
    "source": "step1_16_motion"
  },
  {
    "field": "motion_slot_1_0_parameter",
    "offset": 174,
    "format": "B",
    "length": 1,
    "source": "motion_slot_1_0_parameter"
  },
  {
    "field": "motion_slot_2_0_parameter",
    "offset": 176,
    "format": "B",
    "length": 1,
    "source": "motion_slot_2_0_parameter"
  },
  {
    "field": "motion_slot_3_0_parameter",
    "offset": 178,
    "format": "B",
    "length": 1,
    "source": "motion_slot_3_0_parameter"
  },
  {
    "field": "motion_slot_4_0_parameter",
    "offset": 180,
    "format": "B",
    "length": 1,
    "source": "motion_slot_4_0_parameter"
  },
  {
    "field": "motion_slot_1_step1_16",
    "offset": 182,
    "format": "<H",
    "length": 2,
    "source": "motion_slot_1_step1_16"
  },
  {
    "field": "motion_slot_2_step1_16",
    "offset": 184,
    "format": "<H",
    "length": 2,
    "source": "motion_slot_2_step1_16"
  },
  {
    "field": "motion_slot_3_step1_16",
    "offset": 186,
    "format": "<H",
    "length": 2,
    "source": "motion_slot_3_step1_16"
  },
  {
    "field": "motion_slot_4_step1_16",
    "offset": 188,
    "format": "<H",
    "length": 2,
    "source": "motion_slot_4_step1_16"
  },
  {
    "field": "default_gate_time",
    "offset": 1022,
    "format": "B",
    "length": 1,
    "source": "arp_gate_time"
  }
];
