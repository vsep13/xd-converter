export interface XdPatchField { field: string; offset: number; format: string; length: number }

export const xdPatchSchema: XdPatchField[] = [
  {
    "field": "str_PROG",
    "offset": 0,
    "format": "4s",
    "length": 4
  },
  {
    "field": "program_name",
    "offset": 4,
    "format": "12s",
    "length": 12
  },
  {
    "field": "octave",
    "offset": 16,
    "format": "B",
    "length": 1
  },
  {
    "field": "portamento",
    "offset": 17,
    "format": "B",
    "length": 1
  },
  {
    "field": "key_trig",
    "offset": 18,
    "format": "B",
    "length": 1
  },
  {
    "field": "voice_mode_depth",
    "offset": 19,
    "format": "<H",
    "length": 2
  },
  {
    "field": "voice_mode_type",
    "offset": 21,
    "format": "B",
    "length": 1
  },
  {
    "field": "vco_1_wave",
    "offset": 22,
    "format": "B",
    "length": 1
  },
  {
    "field": "vco_1_octave",
    "offset": 23,
    "format": "B",
    "length": 1
  },
  {
    "field": "vco_1_pitch",
    "offset": 24,
    "format": "<H",
    "length": 2
  },
  {
    "field": "vco_1_shape",
    "offset": 26,
    "format": "<H",
    "length": 2
  },
  {
    "field": "vco_2_wave",
    "offset": 28,
    "format": "B",
    "length": 1
  },
  {
    "field": "vco_2_octave",
    "offset": 29,
    "format": "B",
    "length": 1
  },
  {
    "field": "vco_2_pitch",
    "offset": 30,
    "format": "<H",
    "length": 2
  },
  {
    "field": "vco_2_shape",
    "offset": 32,
    "format": "<H",
    "length": 2
  },
  {
    "field": "sync",
    "offset": 34,
    "format": "B",
    "length": 1
  },
  {
    "field": "ring",
    "offset": 35,
    "format": "B",
    "length": 1
  },
  {
    "field": "cross_mod_depth",
    "offset": 36,
    "format": "<H",
    "length": 2
  },
  {
    "field": "multi_type",
    "offset": 38,
    "format": "B",
    "length": 1
  },
  {
    "field": "select_noise",
    "offset": 39,
    "format": "B",
    "length": 1
  },
  {
    "field": "select_vpm",
    "offset": 40,
    "format": "B",
    "length": 1
  },
  {
    "field": "select_user",
    "offset": 41,
    "format": "B",
    "length": 1
  },
  {
    "field": "shape_noise",
    "offset": 42,
    "format": "<H",
    "length": 2
  },
  {
    "field": "shape_vpm",
    "offset": 44,
    "format": "<H",
    "length": 2
  },
  {
    "field": "shape_user",
    "offset": 46,
    "format": "<H",
    "length": 2
  },
  {
    "field": "shift_shape_noise",
    "offset": 48,
    "format": "<H",
    "length": 2
  },
  {
    "field": "shift_shape_vpm",
    "offset": 50,
    "format": "<H",
    "length": 2
  },
  {
    "field": "shift_shape_user",
    "offset": 52,
    "format": "<H",
    "length": 2
  },
  {
    "field": "vco_1_level",
    "offset": 54,
    "format": "<H",
    "length": 2
  },
  {
    "field": "vco_2_level",
    "offset": 56,
    "format": "<H",
    "length": 2
  },
  {
    "field": "multi_level",
    "offset": 58,
    "format": "<H",
    "length": 2
  },
  {
    "field": "cutoff",
    "offset": 60,
    "format": "<H",
    "length": 2
  },
  {
    "field": "resonance",
    "offset": 62,
    "format": "<H",
    "length": 2
  },
  {
    "field": "cutoff_drive",
    "offset": 64,
    "format": "B",
    "length": 1
  },
  {
    "field": "cutoff_keyboard_track",
    "offset": 65,
    "format": "B",
    "length": 1
  },
  {
    "field": "amp_eg_attack",
    "offset": 66,
    "format": "<H",
    "length": 2
  },
  {
    "field": "amp_eg_decay",
    "offset": 68,
    "format": "<H",
    "length": 2
  },
  {
    "field": "amp_eg_sustain",
    "offset": 70,
    "format": "<H",
    "length": 2
  },
  {
    "field": "amp_eg_release",
    "offset": 72,
    "format": "<H",
    "length": 2
  },
  {
    "field": "eg_attack",
    "offset": 74,
    "format": "<H",
    "length": 2
  },
  {
    "field": "eg_decay",
    "offset": 76,
    "format": "<H",
    "length": 2
  },
  {
    "field": "eg_int",
    "offset": 78,
    "format": "<H",
    "length": 2
  },
  {
    "field": "eg_target",
    "offset": 80,
    "format": "B",
    "length": 1
  },
  {
    "field": "lfo_wave",
    "offset": 81,
    "format": "B",
    "length": 1
  },
  {
    "field": "lfo_mode",
    "offset": 82,
    "format": "B",
    "length": 1
  },
  {
    "field": "lfo_rate",
    "offset": 83,
    "format": "<H",
    "length": 2
  },
  {
    "field": "lfo_int",
    "offset": 85,
    "format": "<H",
    "length": 2
  },
  {
    "field": "lfo_target",
    "offset": 87,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_on_off",
    "offset": 88,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_type",
    "offset": 89,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_chorus",
    "offset": 90,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_ensemble",
    "offset": 91,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_phaser",
    "offset": 92,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_flanger",
    "offset": 93,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_user",
    "offset": 94,
    "format": "B",
    "length": 1
  },
  {
    "field": "mod_fx_time",
    "offset": 95,
    "format": "<H",
    "length": 2
  },
  {
    "field": "mod_fx_depth",
    "offset": 97,
    "format": "<H",
    "length": 2
  },
  {
    "field": "delay_on_off",
    "offset": 99,
    "format": "B",
    "length": 1
  },
  {
    "field": "delay_sub_type",
    "offset": 100,
    "format": "B",
    "length": 1
  },
  {
    "field": "delay_time",
    "offset": 101,
    "format": "<H",
    "length": 2
  },
  {
    "field": "delay_depth",
    "offset": 103,
    "format": "<H",
    "length": 2
  },
  {
    "field": "reverb_on_off",
    "offset": 105,
    "format": "B",
    "length": 1
  },
  {
    "field": "reverb_sub_type",
    "offset": 106,
    "format": "B",
    "length": 1
  },
  {
    "field": "reverb_time",
    "offset": 107,
    "format": "<H",
    "length": 2
  },
  {
    "field": "reverb_depth",
    "offset": 109,
    "format": "<H",
    "length": 2
  },
  {
    "field": "bend_range_plus",
    "offset": 111,
    "format": "B",
    "length": 1
  },
  {
    "field": "bend_range_minus",
    "offset": 112,
    "format": "B",
    "length": 1
  },
  {
    "field": "joystick_assign_plus",
    "offset": 113,
    "format": "B",
    "length": 1
  },
  {
    "field": "joystick_range_plus",
    "offset": 114,
    "format": "B",
    "length": 1
  },
  {
    "field": "joystick_assign_minus",
    "offset": 115,
    "format": "B",
    "length": 1
  },
  {
    "field": "joystick_range_minus",
    "offset": 116,
    "format": "B",
    "length": 1
  },
  {
    "field": "cv_in_mode",
    "offset": 117,
    "format": "B",
    "length": 1
  },
  {
    "field": "cv_in_1_assign",
    "offset": 118,
    "format": "B",
    "length": 1
  },
  {
    "field": "cv_in_1_range",
    "offset": 119,
    "format": "B",
    "length": 1
  },
  {
    "field": "cv_in_2_assign",
    "offset": 120,
    "format": "B",
    "length": 1
  },
  {
    "field": "cv_in_2_range",
    "offset": 121,
    "format": "B",
    "length": 1
  },
  {
    "field": "micro_tuning",
    "offset": 122,
    "format": "B",
    "length": 1
  },
  {
    "field": "scale_key",
    "offset": 123,
    "format": "B",
    "length": 1
  },
  {
    "field": "program_tuning",
    "offset": 124,
    "format": "B",
    "length": 1
  },
  {
    "field": "lfo_key_sync",
    "offset": 125,
    "format": "B",
    "length": 1
  },
  {
    "field": "lfo_voice_sync",
    "offset": 126,
    "format": "B",
    "length": 1
  },
  {
    "field": "lfo_target_osc",
    "offset": 127,
    "format": "B",
    "length": 1
  },
  {
    "field": "cutoff_velocity",
    "offset": 128,
    "format": "B",
    "length": 1
  },
  {
    "field": "amp_velocity",
    "offset": 129,
    "format": "B",
    "length": 1
  },
  {
    "field": "multi_octave",
    "offset": 130,
    "format": "B",
    "length": 1
  },
  {
    "field": "multi_routing",
    "offset": 131,
    "format": "B",
    "length": 1
  },
  {
    "field": "eg_legato",
    "offset": 132,
    "format": "B",
    "length": 1
  },
  {
    "field": "portamento_mode",
    "offset": 133,
    "format": "B",
    "length": 1
  },
  {
    "field": "portamento_bpm_sync",
    "offset": 134,
    "format": "B",
    "length": 1
  },
  {
    "field": "program_level",
    "offset": 135,
    "format": "B",
    "length": 1
  },
  {
    "field": "vpm_param1_feedback",
    "offset": 136,
    "format": "B",
    "length": 1
  },
  {
    "field": "vpm_param2_noise_depth",
    "offset": 137,
    "format": "B",
    "length": 1
  },
  {
    "field": "vpm_param3_shapemodint",
    "offset": 138,
    "format": "B",
    "length": 1
  },
  {
    "field": "vpm_param4_mod_attack",
    "offset": 139,
    "format": "B",
    "length": 1
  },
  {
    "field": "vpm_param5_mod_decay",
    "offset": 140,
    "format": "B",
    "length": 1
  },
  {
    "field": "vpm_param6_modkeytrack",
    "offset": 141,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param1",
    "offset": 142,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param2",
    "offset": 143,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param3",
    "offset": 144,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param4",
    "offset": 145,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param5",
    "offset": 146,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param6",
    "offset": 147,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param5_6_r_r_type",
    "offset": 148,
    "format": "B",
    "length": 1
  },
  {
    "field": "user_param1_2_3_4_type",
    "offset": 149,
    "format": "B",
    "length": 1
  },
  {
    "field": "program_transpose",
    "offset": 150,
    "format": "B",
    "length": 1
  },
  {
    "field": "delay_dry_wet",
    "offset": 151,
    "format": "<H",
    "length": 2
  },
  {
    "field": "reverb_dry_wet",
    "offset": 153,
    "format": "<H",
    "length": 2
  },
  {
    "field": "midi_after_touch_assign",
    "offset": 155,
    "format": "B",
    "length": 1
  },
  {
    "field": "str_PRED",
    "offset": 156,
    "format": "4s",
    "length": 4
  },
  {
    "field": "str_SQ",
    "offset": 160,
    "format": "2s",
    "length": 2
  },
  {
    "field": "step_1_16_active_step",
    "offset": 162,
    "format": "<H",
    "length": 2
  },
  {
    "field": "bpm",
    "offset": 164,
    "format": "<H",
    "length": 2
  },
  {
    "field": "step_length",
    "offset": 166,
    "format": "B",
    "length": 1
  },
  {
    "field": "step_resolution",
    "offset": 167,
    "format": "B",
    "length": 1
  },
  {
    "field": "swing",
    "offset": 168,
    "format": "B",
    "length": 1
  },
  {
    "field": "default_gate_time",
    "offset": 169,
    "format": "B",
    "length": 1
  },
  {
    "field": "step1_16",
    "offset": 170,
    "format": "<H",
    "length": 2
  },
  {
    "field": "step1_16_motion",
    "offset": 172,
    "format": "<H",
    "length": 2
  },
  {
    "field": "motion_slot_1_0_parameter",
    "offset": 174,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_1_1_parameter",
    "offset": 175,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_2_0_parameter",
    "offset": 176,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_2_1_parameter",
    "offset": 177,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_3_0_parameter",
    "offset": 178,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_3_1_parameter",
    "offset": 179,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_4_0_parameter",
    "offset": 180,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_4_1_parameter",
    "offset": 181,
    "format": "B",
    "length": 1
  },
  {
    "field": "motion_slot_1_step1_16",
    "offset": 182,
    "format": "<H",
    "length": 2
  },
  {
    "field": "motion_slot_2_step1_16",
    "offset": 184,
    "format": "<H",
    "length": 2
  },
  {
    "field": "motion_slot_3_step1_16",
    "offset": 186,
    "format": "<H",
    "length": 2
  },
  {
    "field": "motion_slot_4_step1_16",
    "offset": 188,
    "format": "<H",
    "length": 2
  },
  {
    "field": "step_01_event_data",
    "offset": 190,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_02_event_data",
    "offset": 242,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_03_event_data",
    "offset": 294,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_04_event_data",
    "offset": 346,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_05_event_data",
    "offset": 398,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_06_event_data",
    "offset": 450,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_07_event_data",
    "offset": 502,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_08_event_data",
    "offset": 554,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_09_event_data",
    "offset": 606,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_10_event_data",
    "offset": 658,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_11_event_data",
    "offset": 710,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_12_event_data",
    "offset": 762,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_13_event_data",
    "offset": 814,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_14_event_data",
    "offset": 866,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_15_event_data",
    "offset": 918,
    "format": "52s",
    "length": 52
  },
  {
    "field": "step_16_event_data",
    "offset": 970,
    "format": "52s",
    "length": 52
  },
  {
    "field": "arp_gate_time",
    "offset": 1022,
    "format": "B",
    "length": 1
  },
  {
    "field": "arp_rate",
    "offset": 1023,
    "format": "B",
    "length": 1
  }
];
