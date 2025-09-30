import { useMemo, type ReactNode } from 'react'
import type { RawXdPatch } from '../lib/minilogueXd'
import {
  getPatchPanelData,
  type PatchPanelData,
  type PanelValue,
  type DiscreteValue,
  type SwitchValue,
} from '../utils/patchVisual'
import './PatchVisualPanel.css'

type PatchVisualPanelProps = {
  patch: RawXdPatch
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

const clampAngle = (normalized: number) => -135 + clamp(normalized) * 270

const formatTooltip = (label: string, value: PanelValue) => `${label}: ${value.display} (raw ${value.raw}/${value.max})`

const SynthKnob = ({ angle }: { angle: number }) => (
  <svg className="patch-knob__svg" viewBox="0 0 532 532" xmlns="http://www.w3.org/2000/svg">
    <circle cx="266" cy="266" r="261" />
    <g transform={`rotate(${angle} 266 266)`}>
      <line x1="266" y1="20" x2="266" y2="266" />
    </g>
  </svg>
)

const Knob = ({ label, value }: { label: string; value: PanelValue | null }) => {
  if (!value) {
    return (
      <div className="patch-knob is-empty" aria-label={`${label}: unavailable`}>
        <SynthKnob angle={-135} />
        <span className="patch-knob__label">{label}</span>
        <span className="patch-knob__value">—</span>
      </div>
    )
  }

  return (
    <div className="patch-knob" aria-label={formatTooltip(label, value)} title={formatTooltip(label, value)}>
      <SynthKnob angle={clampAngle(value.normalized)} />
      <span className="patch-knob__label">{label}</span>
      <span className="patch-knob__value">{value.display}</span>
    </div>
  )
}

const OptionList = ({ value, title }: { value: DiscreteValue; title: string }) => {
  if (!value.options.length) {
    return (
      <div className="patch-options" title={`${title}: ${value.label}`}>{value.label}</div>
    )
  }

  return (
    <div className="patch-options" role="group" aria-label={title} title={`${title}: ${value.label}`}>
      {value.options.map((option, index) => (
        <span key={option} className={`patch-options__item${index === value.raw ? ' is-active' : ''}`}>
          {option}
        </span>
      ))}
    </div>
  )
}

const ToggleIndicator = ({ value }: { value?: SwitchValue }) => {
  if (!value) return null
  return (
    <div
      className={`patch-toggle${value.active ? ' is-active' : ''}`}
      role="switch"
      aria-checked={value.active}
      title={`${value.label}: ${value.active ? 'On' : 'Off'}`}
    >
      <span>{value.label}</span>
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="patch-visual__section">
    <h4 className="patch-visual__heading">{title}</h4>
    <div className="patch-visual__controls">{children}</div>
  </section>
)

const EffectBlock = ({ title, data }: { title: string; data: PatchPanelData['modFx'] }) => (
  <div className="patch-effect">
    <div className="patch-effect__header">
      <span className="patch-effect__title">{title}</span>
      <span className={`patch-effect__status${data.on ? ' is-on' : ''}`}>{data.on ? 'On' : 'Off'}</span>
    </div>
    {data.type && <OptionList title={`${title} Type`} value={data.type} />}
    <div className="patch-effect__knobs">
      <Knob label="Time" value={data.time} />
      <Knob label="Depth" value={data.depth} />
    </div>
  </div>
)

const PatchVisualPanel = ({ patch }: PatchVisualPanelProps) => {
  const panel = useMemo<PatchPanelData>(() => getPatchPanelData(patch), [patch])

  return (
    <div className="patch-visual">
      <Section title="Voice">
        <OptionList title="Voice Mode" value={panel.voice.mode} />
        <div className="patch-visual__stack">
          <Knob label="Mode Depth" value={panel.voice.depth} />
          <Knob label="Portamento" value={panel.voice.portamento} />
        </div>
      </Section>

      <Section title="VCO 1">
        <OptionList title="VCO 1 Wave" value={panel.vco1.wave} />
        <OptionList title="VCO 1 Octave" value={panel.vco1.octave} />
        <div className="patch-visual__stack">
          <Knob label="Pitch" value={panel.vco1.pitch} />
          <Knob label="Shape" value={panel.vco1.shape} />
          <Knob label="Level" value={panel.vco1.level ?? null} />
        </div>
        <ToggleIndicator value={panel.vco1.sync} />
      </Section>

      <Section title="VCO 2">
        <OptionList title="VCO 2 Wave" value={panel.vco2.wave} />
        <OptionList title="VCO 2 Octave" value={panel.vco2.octave} />
        <div className="patch-visual__stack">
          <Knob label="Pitch" value={panel.vco2.pitch} />
          <Knob label="Shape" value={panel.vco2.shape} />
          <Knob label="Level" value={panel.vco2.level ?? null} />
          <Knob label="Cross Mod" value={panel.vco2.crossMod ?? null} />
        </div>
        <ToggleIndicator value={panel.vco2.ring} />
      </Section>

      <Section title="Multi Engine">
        <OptionList title="Multi Mode" value={panel.multi.mode} />
        {panel.multi.variant && <div className="patch-visual__variant">{panel.multi.variant}</div>}
        <div className="patch-visual__stack">
          <Knob label="Level" value={panel.multi.level} />
          <Knob label="Shape" value={panel.multi.shape ?? null} />
          <Knob label="Shift" value={panel.multi.shift ?? null} />
        </div>
      </Section>

      <Section title="Mixer">
        <div className="patch-visual__stack">
          <Knob label="VCO 1" value={panel.mixer.vco1} />
          <Knob label="VCO 2" value={panel.mixer.vco2} />
          <Knob label="Multi" value={panel.mixer.multi} />
        </div>
      </Section>

      <Section title="Filter">
        <div className="patch-visual__stack">
          <Knob label="Cutoff" value={panel.filter.cutoff} />
          <Knob label="Resonance" value={panel.filter.resonance} />
          <Knob label="Drive" value={panel.filter.drive} />
          <Knob label="Key Track" value={panel.filter.keyTrack} />
        </div>
      </Section>

      <Section title="Amp EG">
        <div className="patch-visual__stack">
          <Knob label="Attack" value={panel.ampEg.attack} />
          <Knob label="Decay" value={panel.ampEg.decay} />
          <Knob label="Sustain" value={panel.ampEg.sustain ?? null} />
          <Knob label="Release" value={panel.ampEg.release ?? null} />
        </div>
      </Section>

      <Section title="EG">
        <div className="patch-visual__stack">
          <Knob label="Attack" value={panel.eg.attack} />
          <Knob label="Decay" value={panel.eg.decay} />
          <Knob label="Intensity" value={panel.eg.intensity ?? null} />
        </div>
        <OptionList title="EG Target" value={panel.eg.target ?? { raw: -1, label: '—', options: [] }} />
      </Section>

      <Section title="LFO">
        <OptionList title="LFO Wave" value={panel.lfo.wave} />
        <OptionList title="LFO Mode" value={panel.lfo.mode} />
        <div className="patch-visual__stack">
          <Knob label="Rate" value={panel.lfo.rate} />
          <Knob label="Intensity" value={panel.lfo.intensity} />
        </div>
        <OptionList title="LFO Target" value={panel.lfo.target} />
      </Section>

      <Section title="Effects">
        <div className="patch-effects">
          <EffectBlock title="Mod" data={panel.modFx} />
          <EffectBlock title="Delay" data={panel.delay} />
          <EffectBlock title="Reverb" data={panel.reverb} />
        </div>
      </Section>
    </div>
  )
}

export default PatchVisualPanel
