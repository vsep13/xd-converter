import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MidiPortInfo } from './lib/midi'
import { listMidiInputs, listMidiOutputs, requestMidiAccess } from './lib/midi'
import type { MinilogueXdIdentity } from './lib/minilogueXdMidi'
import { MinilogueXdLibrarian } from './lib/minilogueXdMidi'
import type { RawXdPatch, XdCollection } from './lib/minilogueXd'

const clampSlot = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback
  if (value < 0) return 0
  if (value > 511) return 511
  return Math.round(value)
}

type PatchOption = {
  id: string
  label: string
  patch: RawXdPatch
}

type MidiLibrarianPanelProps = {
  workspacePatches: RawXdPatch[]
  collection: XdCollection | null
  onPatchFetched: (patch: RawXdPatch) => void
  onCollectionDumped?: (patches: RawXdPatch[], label: string) => void
}

export const MidiLibrarianPanel = ({ workspacePatches, collection, onPatchFetched, onCollectionDumped }: MidiLibrarianPanelProps) => {
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [inputs, setInputs] = useState<MidiPortInfo[]>([])
  const [outputs, setOutputs] = useState<MidiPortInfo[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [selectedOutput, setSelectedOutput] = useState('')
  const [librarian, setLibrarian] = useState<MinilogueXdLibrarian | null>(null)
  const [identity, setIdentity] = useState<MinilogueXdIdentity | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchSlot, setFetchSlot] = useState(0)
  const [sendSlot, setSendSlot] = useState(0)
  const [selectedSendPatch, setSelectedSendPatch] = useState('')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeCount, setRangeCount] = useState(16)

  const refreshPorts = useCallback(() => {
    if (!midiAccess) return
    setInputs(listMidiInputs(midiAccess))
    setOutputs(listMidiOutputs(midiAccess))
  }, [midiAccess])

  useEffect(() => {
    if (!midiAccess) return
    refreshPorts()
    const handleStateChange = () => refreshPorts()
    midiAccess.addEventListener('statechange', handleStateChange)
    return () => midiAccess.removeEventListener('statechange', handleStateChange)
  }, [midiAccess, refreshPorts])

  const enableMidi = useCallback(async () => {
    try {
      setError(null)
      setStatus('Requesting MIDI access…')
      const access = await requestMidiAccess()
      setMidiAccess(access)
      setStatus('MIDI access available')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to access Web MIDI'
      setError(message)
      setStatus(null)
    }
  }, [])

  const disconnect = useCallback(() => {
    librarian?.detach()
    setLibrarian(null)
    setIdentity(null)
    setStatus('Disconnected from MIDI device')
  }, [librarian])

  const connect = useCallback(async () => {
    if (!midiAccess) {
      setError('Enable MIDI access first')
      return
    }
    if (!selectedInput || !selectedOutput) {
      setError('Select both MIDI input and output ports')
      return
    }
    setError(null)
    setBusy(true)
    try {
      librarian?.detach()
      const instance = new MinilogueXdLibrarian(midiAccess)
      await instance.attach(selectedInput, selectedOutput)
      setLibrarian(instance)
      setStatus('Connected – probing device…')
      try {
        const info = await instance.probe()
        setIdentity(info)
        setStatus(`Connected to minilogue xd (firmware ${info.firmwareVersion.major}.${info.firmwareVersion.minor})`)
      } catch (probeError) {
        const message = probeError instanceof Error ? probeError.message : 'Probe failed'
        setStatus(`Connected (probe failed: ${message})`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to MIDI device'
      setError(message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [librarian, midiAccess, selectedInput, selectedOutput])

  const handleFetchCurrent = useCallback(async () => {
    if (!librarian) {
      setError('Connect to a minilogue xd first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setStatus('Requesting current program…')
      const patch = await librarian.requestCurrentProgram()
      onPatchFetched({ ...patch, index: patch.index })
      setStatus(`Fetched current program: ${patch.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch current program'
      setError(message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [librarian, onPatchFetched])

  const handleFetchSlot = useCallback(async () => {
    if (!librarian) {
      setError('Connect to a minilogue xd first')
      return
    }
    const slot = clampSlot(fetchSlot, 0)
    setFetchSlot(slot)
    setBusy(true)
    setError(null)
    try {
      setStatus(`Fetching program slot ${slot}…`)
      const patch = await librarian.requestProgram(slot)
      onPatchFetched({ ...patch, index: slot })
      setStatus(`Fetched program ${slot}: ${patch.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to fetch program ${slot}`
      setError(message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [fetchSlot, librarian, onPatchFetched])

  const handleFetchRange = useCallback(async () => {
    if (!librarian) {
      setError('Connect to a minilogue xd first')
      return
    }
    if (!onCollectionDumped) {
      setError('Collection dump handler is not available')
      return
    }
    const start = clampSlot(rangeStart, 0)
    const count = Math.max(1, Math.min(rangeCount, 128))
    setRangeStart(start)
    setRangeCount(count)
    setBusy(true)
    setError(null)
    const patches: RawXdPatch[] = []
    try {
      for (let i = 0; i < count; i += 1) {
        const slot = clampSlot(start + i, start + i)
        setStatus(`Fetching program ${slot} (${i + 1}/${count})…`)
        const patch = await librarian.requestProgram(slot)
        patches.push({ ...patch, index: slot })
      }
      onCollectionDumped(patches, `MIDI dump ${start}-${start + count - 1}`)
      setStatus(`Fetched ${patches.length} programs starting at ${start}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed during range dump'
      setError(message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [librarian, onCollectionDumped, rangeCount, rangeStart])

  const sendOptions = useMemo<PatchOption[]>(() => {
    const options: PatchOption[] = []
    if (collection) {
      collection.patches.forEach((patch, index) => {
        options.push({
          id: `collection:${index}`,
          label: `Collection • ${patch.name} (#${index})`,
          patch,
        })
      })
    }
    workspacePatches.forEach((patch, index) => {
      options.push({
        id: `workspace:${index}`,
        label: `Workspace • ${patch.name} (#${index})`,
        patch,
      })
    })
    return options
  }, [collection, workspacePatches])

  const resolveSelectedPatch = useCallback((): RawXdPatch | null => {
    if (!selectedSendPatch) return null
    const option = sendOptions.find((item) => item.id === selectedSendPatch)
    return option?.patch ?? null
  }, [selectedSendPatch, sendOptions])

  const handleSendPatch = useCallback(async () => {
    if (!librarian) {
      setError('Connect to a minilogue xd first')
      return
    }
    const patch = resolveSelectedPatch()
    if (!patch) {
      setError('Select a patch to send')
      return
    }
    const slot = clampSlot(sendSlot, 0)
    setSendSlot(slot)
    setBusy(true)
    setError(null)
    try {
      setStatus(`Sending patch to program ${slot}…`)
      await librarian.sendProgram(slot, patch)
      setStatus(`Sent patch "${patch.name}" to program ${slot}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to send patch to program ${slot}`
      setError(message)
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [librarian, resolveSelectedPatch, sendSlot])

  const identitySummary = useMemo(() => {
    if (!identity) return null
    return `Global CH ${identity.globalChannel + 1} • Firmware ${identity.firmwareVersion.major}.${identity.firmwareVersion.minor}`
  }, [identity])

  return (
    <div className="card">
      <div className="stack">
        <div className="midi-row">
          <button type="button" className="btn" onClick={enableMidi} disabled={!!midiAccess}>
            {midiAccess ? 'MIDI enabled' : 'Enable MIDI'}
          </button>
          <button type="button" className="btn" onClick={connect} disabled={!midiAccess || busy}>
            Connect
          </button>
          <button type="button" className="btn btn--ghost" onClick={disconnect} disabled={!librarian}>
            Disconnect
          </button>
        </div>

        <div className="midi-grid">
          <label className="midi-field">
            <span className="muted small">Input port</span>
            <select value={selectedInput} onChange={(event) => setSelectedInput(event.target.value)} disabled={!midiAccess || busy}>
              <option value="">Select input…</option>
              {inputs.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name}
                </option>
              ))}
            </select>
          </label>

          <label className="midi-field">
            <span className="muted small">Output port</span>
            <select value={selectedOutput} onChange={(event) => setSelectedOutput(event.target.value)} disabled={!midiAccess || busy}>
              <option value="">Select output…</option>
              {outputs.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {identitySummary && <p className="muted small">{identitySummary}</p>}

        <div className="midi-actions">
          <div className="midi-action">
            <button type="button" className="btn" onClick={handleFetchCurrent} disabled={!librarian || busy}>
              Fetch current program
            </button>
          </div>

          <div className="midi-action">
            <label className="midi-field">
              <span className="muted small">Program slot</span>
              <input
                type="number"
                min={0}
                max={511}
                value={fetchSlot}
                onChange={(event) => setFetchSlot(Number(event.target.value))}
                disabled={busy}
              />
            </label>
            <button type="button" className="btn" onClick={handleFetchSlot} disabled={!librarian || busy}>
              Fetch program
            </button>
          </div>

          <div className="midi-action">
            <label className="midi-field">
              <span className="muted small">Range start</span>
              <input
                type="number"
                min={0}
                max={511}
                value={rangeStart}
                onChange={(event) => setRangeStart(Number(event.target.value))}
                disabled={busy}
              />
            </label>
            <label className="midi-field">
              <span className="muted small">Count</span>
              <input
                type="number"
                min={1}
                max={128}
                value={rangeCount}
                onChange={(event) => setRangeCount(Number(event.target.value))}
                disabled={busy}
              />
            </label>
            <button type="button" className="btn" onClick={handleFetchRange} disabled={!librarian || busy || !onCollectionDumped}>
              Fetch range → collection
            </button>
          </div>

          <div className="midi-action">
            <label className="midi-field">
              <span className="muted small">Patch to send</span>
              <select value={selectedSendPatch} onChange={(event) => setSelectedSendPatch(event.target.value)} disabled={busy || !sendOptions.length}>
                <option value="">Select patch…</option>
                {sendOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="midi-field">
              <span className="muted small">Target slot</span>
              <input
                type="number"
                min={0}
                max={511}
                value={sendSlot}
                onChange={(event) => setSendSlot(Number(event.target.value))}
                disabled={busy}
              />
            </label>
            <button type="button" className="btn" onClick={handleSendPatch} disabled={!librarian || busy || !selectedSendPatch}>
              Send patch
            </button>
          </div>
        </div>

        {status && <p className="muted small">{status}</p>}
        {error && <p className="error small">{error}</p>}
        {busy && <p className="muted small">Working…</p>}
      </div>
    </div>
  )
}

export default MidiLibrarianPanel
