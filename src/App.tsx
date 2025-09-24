import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  listCachedFiles,
  saveCachedFile,
  loadCachedFile,
  removeCachedFile,
  clearCachedFiles,
  type CachedFileMeta,
} from './lib/cache'
import './App.css'
import { getPatchSummary } from './utils/patchSummary'
import {
  bufferToBlob,
  buildBulkPatchZip,
  buildXdCollectionArchive,
  buildXdPatchArchive,
  createDefaultPresetFields,
  defaultFavoriteSlots,
  normalizeFavoriteSlots,
  parseXdCollection,
  parseXdPatch,
  updatePatchComment,
  updatePatchName,
  type BuildCollectionOptions,
  type PresetInformationFields,
  type RawXdPatch,
  type XdCollection,
  type XdCollectionKind,
} from './lib/minilogueXd'

const readFileAsArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error('Unable to read file contents'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 400)
}

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

type CachedLibraryListProps = {
  entries: CachedFileMeta[]
  onLoad: (entry: CachedFileMeta) => void
  onRemove: (id: string) => void
  onClear: () => void
  loadingId: string | null
  formatBytes: (value: number) => string
}

const CachedLibraryList = ({ entries, onLoad, onRemove, onClear, loadingId, formatBytes }: CachedLibraryListProps) => {
  if (!entries.length) return null

  return (
    <div className="cache-panel">
      <div className="cache-header">
        <span className="cache-title">Recent libraries</span>
        <button type="button" className="btn btn--ghost" onClick={onClear}>
          Clear all
        </button>
      </div>
      <ul className="cache-list">
        {entries.map((entry) => (
          <li key={entry.id} className="cache-item">
            <div className="cache-item__meta">
              <span className="cache-item__name">{entry.name}</span>
              <span className="cache-item__details">
                {entry.type === 'preset' ? '.mnlgxdpreset' : '.mnlgxdlib'} •
                {' '}{new Date(entry.timestamp).toLocaleString()} • {formatBytes(entry.size)}
              </span>
            </div>
            <div className="cache-item__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onLoad(entry)}
                disabled={loadingId === entry.id}
              >
                Load
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--danger"
                onClick={() => onRemove(entry.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}



const toFilename = (value: string, fallback: string) => {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return fallback
  return trimmed.replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '') || fallback
}

type PatchWithSource = RawXdPatch & { sourceName?: string }

type EditorPatch = RawXdPatch & { sourceName?: string }

const parseProgInfoEntries = (xml: string) => {
  const results = new Map<string, string>()
  const skip = new Set(['Comment', 'Programmer'])

  if (!xml) return []

  const process = (key: string, value: string | null) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed || skip.has(key)) return
    if (!results.has(key)) {
      results.set(key, trimmed)
    }
  }

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const root = doc.documentElement
      root
        ?.querySelectorAll('*')
        .forEach((node) => {
          if (node.children.length === 0) {
            process(node.tagName, node.textContent)
          }
        })
    } catch (error) {
      console.warn('Failed to parse prog info xml', error)
    }
  }

  if (results.size === 0) {
    const regex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(xml)) !== null) {
      process(match[1], match[2])
    }
  }

  const entries = Array.from(results.entries())
  const toLabel = (key: string) =>
    key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (s) => s.toUpperCase())
  return entries.map(([key, value]) => ({ key: toLabel(key), value }))
}

const presetFieldLabels: Record<keyof PresetInformationFields, string> = {
  dataId: 'Data ID',
  name: 'Name',
  author: 'Author',
  version: 'Version',
  numOfProg: 'Programs',
  date: 'Date',
  prefix: 'Prefix',
  copyright: 'Copyright',
}

type PresetTemplate = {
  id: string
  name: string
  fields: PresetInformationFields
}

const TEMPLATE_STORAGE_KEY = 'xdConverter.presetTemplates'

const formatTimestamp = (value?: string) => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function App() {
  const [collection, setCollection] = useState<XdCollection | null>(null)
  const [collectionError, setCollectionError] = useState<string | null>(null)
  const [collectionPresetFields, setCollectionPresetFields] = useState<PresetInformationFields>(createDefaultPresetFields)
  const [collectionBusy, setCollectionBusy] = useState(false)

  const [patches, setPatches] = useState<PatchWithSource[]>([])
  const [patchError, setPatchError] = useState<string | null>(null)
  const [outputKind, setOutputKind] = useState<XdCollectionKind>('library')
  const [buildPresetFields, setBuildPresetFields] = useState<PresetInformationFields>(createDefaultPresetFields)
  const [collectionFavorites, setCollectionFavorites] = useState<number[]>(defaultFavoriteSlots(0))
  const [buildFavorites, setBuildFavorites] = useState<number[]>(defaultFavoriteSlots(0))
  const [templates, setTemplates] = useState<PresetTemplate[]>([])
  const [collectionFilter, setCollectionFilter] = useState('')
  const [buildFilter, setBuildFilter] = useState('')
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const [cachedLibraries, setCachedLibraries] = useState<CachedFileMeta[]>([])
  const [loadingCacheId, setLoadingCacheId] = useState<string | null>(null)
  const [selectedPatch, setSelectedPatch] = useState<{ patch: EditorPatch; context: 'collection' | 'build' } | null>(null)
  const refreshCachedLibraries = useCallback(async () => {
    try {
      const entries = await listCachedFiles()
      setCachedLibraries(entries)
    } catch (error) {
      console.warn('Failed to load cached libraries', error)
    }
  }, [])

  const previousPatchCountRef = useRef(0)

  const factoryCount = useMemo(() => (collection ? collection.patches.filter((p) => p.status === 'factory').length : 0), [collection])
  const initCount = useMemo(() => (collection ? collection.patches.filter((p) => p.status === 'init').length : 0), [collection])
  const collectionStatusSummary = useMemo(() => {
    const parts: string[] = []
    if (factoryCount > 0) parts.push(`${factoryCount} factory`)
    if (initCount > 0) parts.push(`${initCount} init`)
    return parts
  }, [factoryCount, initCount])
  const buildFactoryCount = useMemo(() => patches.filter((p) => p.status === 'factory').length, [patches])
  const buildInitCount = useMemo(() => patches.filter((p) => p.status === 'init').length, [patches])
  const buildStatusSummary = useMemo(() => {
    const parts: string[] = []
    if (buildFactoryCount > 0) parts.push(`${buildFactoryCount} factory`)
    if (buildInitCount > 0) parts.push(`${buildInitCount} init`)
    return parts.join(' · ')
  }, [buildFactoryCount, buildInitCount])

  useEffect(() => {
    refreshCachedLibraries()
  }, [refreshCachedLibraries])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PresetTemplate[]
        if (Array.isArray(parsed)) {
          setTemplates(
            parsed
              .filter((item) => item && typeof item.name === 'string' && item.fields)
              .map((item) => ({ ...item, id: item.id ?? `${item.name}-${Math.random()}` })),
          )
        }
      }
    } catch (error) {
      console.warn('Failed to load preset templates', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
    } catch (error) {
      console.warn('Failed to persist preset templates', error)
    }
  }, [templates])

  useEffect(() => {
    if (outputKind === 'preset') {
      setBuildPresetFields((prev) => ({ ...prev, numOfProg: String(patches.length) }))
    }
  }, [patches.length, outputKind])

  useEffect(() => {
    if (!collection) {
      setCollectionFavorites(defaultFavoriteSlots(0))
      setCollectionFilter('')
      return
    }
    const defaults = createDefaultPresetFields()
    defaults.numOfProg = String(collection.patches.length)
    if (collection.metadata.presetFields) {
      setCollectionPresetFields({ ...defaults, ...collection.metadata.presetFields })
    } else {
      setCollectionPresetFields(defaults)
    }
    setCollectionFavorites(normalizeFavoriteSlots(collection.metadata.favorites, collection.patches.length))
    setValidationWarnings(collection.metadata.warnings ?? [])
  }, [collection])

  useEffect(() => {
    setPatchError(null)
  }, [patches])

  useEffect(() => {
    const previousCount = previousPatchCountRef.current
    previousPatchCountRef.current = patches.length
    setBuildFavorites((prev) => {
      if (patches.length === 0) {
        return defaultFavoriteSlots(0)
      }
      if (previousCount === 0) {
        return defaultFavoriteSlots(patches.length)
      }
      return normalizeFavoriteSlots(prev, patches.length)
    })
  }, [patches])

  const createTemplateId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  const saveTemplate = (fields: PresetInformationFields) => {
    if (typeof window === 'undefined') return
    const name = window.prompt('Template name')?.trim()
    if (!name) return
    setTemplates((prev) => {
      const next = prev.filter((template) => template.name !== name)
      return [...next, { id: createTemplateId(), name, fields: { ...fields } }]
    })
  }

  const deleteTemplate = (id: string) => {
    if (typeof window === 'undefined') return
    const template = templates.find((item) => item.id === id)
    if (!template) return
    const confirmed = window.confirm(`Delete template "${template.name}"?`)
    if (!confirmed) return
    setTemplates((prev) => prev.filter((item) => item.id !== id))
  }

  const handleCollectionUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCollectionError(null)
    setCollectionBusy(true)
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const parsed = parseXdCollection(buffer, file.name)
      setValidationWarnings(parsed.metadata.warnings ?? [])
      setCollection(parsed)
      try {
        const ext = file.name.toLowerCase()
        const entryType = ext.endsWith('mnlgxdpreset') ? 'preset' : 'library'
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        await saveCachedFile({ id, name: file.name, type: entryType, buffer, size: buffer.byteLength })
        refreshCachedLibraries()
      } catch (error) {
        console.warn('Failed to cache uploaded file', error)
      }
    } catch (err) {
      setValidationWarnings([])
      console.error(err)
      setCollection(null)
      setCollectionError(err instanceof Error ? err.message : 'Failed to parse archive')
    } finally {
      setCollectionBusy(false)
      event.target.value = ''
    }
  }

  const handlePatchUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const results: PatchWithSource[] = []
    const issues: string[] = []

    for (const file of files) {
      try {
        const buffer = await readFileAsArrayBuffer(file)
        const patch = parseXdPatch(buffer)
        results.push({ ...patch, sourceName: file.name })
      } catch (err) {
        console.error(err)
        issues.push(`${file.name}: ${err instanceof Error ? err.message : 'Unable to parse patch'}`)
      }
    }

    setPatches((prev) => [...prev, ...results])
    setPatchError(issues.length ? issues.join('\n') : null)
    event.target.value = ''
  }

  const movePatch = (index: number, offset: number) => {
    setPatches((prev) => {
      const next = [...prev]
      const target = index + offset
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)

      const mapping = new Map<number, number>()
      next.forEach((patch, newIndex) => {
        const oldIndex = prev.indexOf(patch)
        mapping.set(oldIndex, newIndex)
      })

      setBuildFavorites((favorites) =>
        normalizeFavoriteSlots(
          favorites.map((slot) => {
            const mapped = mapping.get(slot)
            return mapped ?? slot
          }),
          next.length,
        ),
      )

      return next
    })
  }

  const removePatch = (index: number) => {
    setPatches((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const next = prev.filter((_, idx) => idx !== index)
      setBuildFavorites((favorites) =>
        normalizeFavoriteSlots(
          favorites.map((slot) => {
            if (slot === index) return 0
            if (slot > index) return slot - 1
            return slot
          }),
          next.length,
        ),
      )
      return next
    })
  }

  const handleCollectionDownload = (kind: XdCollectionKind) => {
    if (!collection) return
    try {
      const options: BuildCollectionOptions = {
        kind,
        presetInfo: kind === 'preset' ? { ...collectionPresetFields, numOfProg: String(collection.patches.length) } : undefined,
        favorites: kind === 'library' ? collectionFavorites : undefined,
      }
      const buffer = buildXdCollectionArchive(collection.patches, options)
      const filenameBase = toFilename(
        kind === 'preset' ? collectionPresetFields.name : collection.metadata.sourceName ?? 'minilogue-xd-collection',
        kind === 'preset' ? 'minilogue-xd-preset' : 'minilogue-xd-library',
      )
      const extension = kind === 'preset' ? 'mnlgxdpreset' : 'mnlgxdlib'
      triggerDownload(bufferToBlob(buffer), `${filenameBase}.${extension}`)
    } catch (err) {
      console.error(err)
      setCollectionError(err instanceof Error ? err.message : 'Failed to build archive')
    }
  }

  const handleLoadCachedLibrary = async (entry: CachedFileMeta) => {
    if (loadingCacheId) return
    setCollectionError(null)
    setLoadingCacheId(entry.id)
    try {
      const buffer = await loadCachedFile(entry.id)
      const parsed = parseXdCollection(buffer, entry.name)
      setValidationWarnings(parsed.metadata.warnings ?? [])
      setCollection(parsed)
    } catch (error) {
      console.error(error)
      setCollectionError(error instanceof Error ? error.message : 'Failed to load cached file')
    } finally {
      setLoadingCacheId(null)
    }
  }

  const handleDeleteCachedLibrary = async (id: string) => {
    try {
      await removeCachedFile(id)
      refreshCachedLibraries()
    } catch (error) {
      console.warn('Failed to delete cached entry', error)
    }
  }

  const handleClearCachedLibraries = async () => {
    try {
      await clearCachedFiles()
      refreshCachedLibraries()
    } catch (error) {
      console.warn('Failed to clear cached entries', error)
    }
  }

  const handleShowDetails = (patch: EditorPatch, context: 'collection' | 'build') => {
    setSelectedPatch({ patch, context })
  }

  const handleCloseDetails = () => setSelectedPatch(null)

  const handleDownloadAllPatches = () => {
    if (!collection) return
    try {
      const buffer = buildBulkPatchZip(collection.patches)
      const base = toFilename(collection.metadata.sourceName ?? collectionPresetFields.name, 'minilogue-xd-patches')
      triggerDownload(bufferToBlob(buffer), `${base}-patches.zip`)
    } catch (err) {
      console.error(err)
      setCollectionError(err instanceof Error ? err.message : 'Failed to build patch bundle')
    }
  }

  const handleDownloadPatch = (patch: RawXdPatch) => {
    try {
      const buffer = buildXdPatchArchive(patch)
      triggerDownload(bufferToBlob(buffer), `${toFilename(patch.name, 'patch')}.mnlgxdprog`)
    } catch (err) {
      console.error(err)
      setCollectionError(err instanceof Error ? err.message : 'Failed to build patch archive')
    }
  }

  const handleBuildCollection = () => {
    if (!patches.length) {
      setPatchError('Add at least one patch to build a collection')
      return
    }
    try {
      const options: BuildCollectionOptions = {
        kind: outputKind,
        presetInfo:
          outputKind === 'preset'
            ? { ...buildPresetFields, numOfProg: String(patches.length) }
            : undefined,
        favorites: outputKind === 'library' ? buildFavorites : undefined,
      }
      const buffer = buildXdCollectionArchive(patches, options)
      const base = toFilename(
        outputKind === 'preset' ? buildPresetFields.name : buildPresetFields.dataId,
        outputKind === 'preset' ? 'minilogue-xd-preset' : 'minilogue-xd-library',
      )
      const extension = outputKind === 'preset' ? 'mnlgxdpreset' : 'mnlgxdlib'
      triggerDownload(bufferToBlob(buffer), `${base || 'minilogue-xd-pack'}.${extension}`)
    } catch (err) {
      console.error(err)
      setPatchError(err instanceof Error ? err.message : 'Failed to build archive')
    }
  }

  const collectionPresetForm = useMemo(() => (
    <div className="panel">
      <h3 className="panel__title">Preset metadata</h3>
      <div className="grid">
        {(Object.keys(presetFieldLabels) as Array<keyof PresetInformationFields>).map((key) => (
          <label key={key} className="field">
            <span className="field__label">{presetFieldLabels[key]}</span>
            <input
              type="text"
              value={collectionPresetFields[key] ?? ''}
              onChange={(event) => setCollectionPresetFields((prev) => ({ ...prev, [key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
    </div>
  ), [collectionPresetFields])

  const buildPresetForm = useMemo(() => (
    outputKind === 'preset' ? (
      <div className="panel">
        <h3 className="panel__title">Preset metadata</h3>
        <div className="grid">
          {(Object.keys(presetFieldLabels) as Array<keyof PresetInformationFields>).map((key) => (
            <label key={key} className="field">
              <span className="field__label">{presetFieldLabels[key]}</span>
              <input
                type="text"
                value={buildPresetFields[key] ?? ''}
                onChange={(event) => setBuildPresetFields((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      </div>
    ) : null
  ), [buildPresetFields, outputKind])

  return (
    <>
      <div className="app">
      <header className="header">
        <div>
          <h1 className="header__title">Minilogue xd Librarian Tools</h1>
          <p className="header__subtitle">
            Convert between .mnlgxdlib, .mnlgxdpreset, and .mnlgxdprog files directly in your browser.
          </p>
        </div>
      </header>

      <main className="main">
        <section className="section">
          <h2>Library or preset ➜ individual patches / other format</h2>
          <p className="muted">
            Upload an existing librarian file to extract individual patches, or repack it as a preset pack.
          </p>
          <div className="card">
            <label className="dropzone">
              <span className="dropzone__title">Drop a .mnlgxdlib or .mnlgxdpreset file</span>
              <span className="dropzone__subtitle">or click to browse</span>
              <input type="file" accept=".mnlgxdlib,.mnlgxdpreset,.zip" onChange={handleCollectionUpload} />
            </label>

            {collectionBusy && <p className="muted">Reading archive…</p>}
            {collectionError && <p className="error">{collectionError}</p>}

            {cachedLibraries.length > 0 && (
              <CachedLibraryList
                entries={cachedLibraries}
                onLoad={handleLoadCachedLibrary}
                onRemove={handleDeleteCachedLibrary}
                onClear={handleClearCachedLibraries}
                loadingId={loadingCacheId}
                formatBytes={formatBytes}
              />
            )}

            {collection && (
              <div className="stack">
                {validationWarnings.length > 0 && (
                  <ValidationCallout title="Archive warnings" items={validationWarnings} />
                )}
                <div className="summary">
                  <div>
                    <span className="summary__label">Source file</span>
                    <span>{collection.metadata.sourceName ?? '—'}</span>
                  </div>
                  <div>
                    <span className="summary__label">Patches detected</span>
                    <span>{collection.patches.length}</span>
                  </div>
                  {collectionStatusSummary.length > 0 && (
                    <div>
                      <span className="summary__label">Factory / init</span>
                      <span>{collectionStatusSummary.join(' · ')}</span>
                    </div>
                  )}
                  {collection.metadata.toolVersion && (
                    <div>
                      <span className="summary__label">Created with</span>
                      <span>
                        {collection.metadata.toolVersion}
                        {collection.metadata.buildTimestamp
                          ? ` · ${formatTimestamp(collection.metadata.buildTimestamp)}`
                          : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className="actions">
                  <button type="button" onClick={() => handleCollectionDownload('library')} className="btn">
                    Download .mnlgxdlib
                  </button>
                  <button type="button" onClick={() => handleCollectionDownload('preset')} className="btn">
                    Download .mnlgxdpreset
                  </button>
                  <button type="button" onClick={handleDownloadAllPatches} className="btn">
                    Download all patches (.zip)
                  </button>
                </div>

                <MetadataEditor
                  patches={collection.patches.map((patch) => ({ ...patch }))}
                  readOnly
                  filter={collectionFilter}
                  onFilterChange={setCollectionFilter}
                  renderActions={(patch) => (
                    <div className="metadata-controls__group">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => handleShowDetails(patch, 'collection')}
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => handleDownloadPatch(patch)}
                      >
                        .mnlgxdprog
                      </button>
                    </div>
                  )}
                />

                {collectionPresetForm}

                {collection.metadata.kind === 'library' && collection.patches.length > 1 && (
                  <FavoritesEditor
                    title="Favorites layout"
                    patches={collection.patches}
                    favorites={collectionFavorites}
                    onChange={(next) =>
                      setCollectionFavorites(normalizeFavoriteSlots(next, collection.patches.length))
                    }
                  />
                )}

                <PresetTemplateControls
                  title="Templates"
                  templates={templates}
                  onApply={(template) => setCollectionPresetFields({ ...template.fields, numOfProg: String(collection.patches.length) })}
                  onSave={() => saveTemplate(collectionPresetFields)}
                  onDelete={deleteTemplate}
                />
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <h2>Patches ➜ new librarian file</h2>
          <p className="muted">
            Combine individual .mnlgxdprog files into a library (.mnlgxdlib) or preset pack (.mnlgxdpreset).
          </p>

          <div className="card">
            <label className="dropzone">
              <span className="dropzone__title">Add .mnlgxdprog files</span>
              <span className="dropzone__subtitle">Files remain on this device only</span>
              <input type="file" accept=".mnlgxdprog" multiple onChange={handlePatchUpload} />
            </label>

            {patchError && <p className="error multiline">{patchError}</p>}

            {patches.length > 0 && (
              <div className="stack">
                <MetadataEditor
                  patches={patches}
                  onMove={movePatch}
                  onRemove={removePatch}
                  onRename={(index, name) =>
                    setPatches((prev) =>
                      prev.map((patch, idx) => (idx === index ? updatePatchName(patch, name) : patch)),
                    )
                  }
                  onComment={(index, comment) =>
                    setPatches((prev) =>
                      prev.map((patch, idx) => (idx === index ? updatePatchComment(patch, comment) : patch)),
                    )
                  }
                  onShuffle={() =>
                    setPatches((prev) => {
                      const next = [...prev]
                      for (let i = next.length - 1; i > 0; i -= 1) {
                        const j = Math.floor(Math.random() * (i + 1))
                        ;[next[i], next[j]] = [next[j], next[i]]
                      }
                      return next
                    })
                  }
                  onReverse={() => setPatches((prev) => [...prev].reverse())}
                  filter={buildFilter}
                  onFilterChange={setBuildFilter}
                  formatBytes={formatBytes}
                  renderActions={(patch) => (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => handleShowDetails(patch, 'build')}
                    >
                      Details
                    </button>
                  )}
                />

                {buildStatusSummary && (
                  <div className="muted small">{buildStatusSummary}</div>
                )}
                <div className="options">
                  <label>
                    <input
                      type="radio"
                      name="output-kind"
                      value="library"
                      checked={outputKind === 'library'}
                      onChange={() => setOutputKind('library')}
                    />
                    <span>.mnlgxdlib (library)</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="output-kind"
                      value="preset"
                      checked={outputKind === 'preset'}
                      onChange={() => setOutputKind('preset')}
                    />
                    <span>.mnlgxdpreset (preset pack)</span>
                  </label>
                </div>

                {outputKind === 'library' && patches.length > 1 && (
                  <FavoritesEditor
                    title="Favorites layout"
                    patches={patches}
                    favorites={buildFavorites}
                    onChange={(next) => setBuildFavorites(normalizeFavoriteSlots(next, patches.length))}
                  />
                )}

                {buildPresetForm}

                <PresetTemplateControls
                  title="Templates"
                  templates={templates}
                  onApply={(template) => setBuildPresetFields({ ...template.fields, numOfProg: String(patches.length) })}
                  onSave={() => saveTemplate(buildPresetFields)}
                  onDelete={deleteTemplate}
                />

                <button type="button" onClick={handleBuildCollection} className="btn btn--primary">
                  Build {outputKind === 'preset' ? 'preset pack' : 'library'}
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
      </div>
      {selectedPatch && <PatchDetailsPanel detail={selectedPatch} onClose={handleCloseDetails} />}
    </>
  )
}

export default App

type TemplateControlsProps = {
  title: string
  templates: PresetTemplate[]
  onApply: (template: PresetTemplate) => void
  onSave: () => void
  onDelete: (id: string) => void
}

const PresetTemplateControls = ({ title, templates, onApply, onSave, onDelete }: TemplateControlsProps) => {
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    if (!templates.length) {
      setSelectedId('')
    } else if (!templates.find((item) => item.id === selectedId)) {
      setSelectedId(templates[templates.length - 1]?.id ?? '')
    }
  }, [templates, selectedId])

  const selectedTemplate = templates.find((item) => item.id === selectedId)

  return (
    <div className="template-panel">
      <div className="template-panel__header">
        <span className="template-panel__title">{title}</span>
        <button type="button" className="btn btn--ghost" onClick={onSave}>
          Save current
        </button>
      </div>
      <div className="template-panel__body">
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="template-panel__select"
        >
          <option value="" disabled>
            {templates.length ? 'Choose template' : 'No templates saved'}
          </option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <div className="template-panel__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => selectedTemplate && onApply(selectedTemplate)}
            disabled={!selectedTemplate}
          >
            Apply
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={() => selectedTemplate && onDelete(selectedTemplate.id)}
            disabled={!selectedTemplate}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

type FavoritesEditorProps<Patch extends { name: string }> = {
  title: string
  patches: Patch[]
  favorites: number[]
  onChange: (next: number[]) => void
}

const FavoritesEditor = <Patch extends { name: string }>({ title, patches, favorites, onChange }: FavoritesEditorProps<Patch>) => {
  const handleChange = (slotIndex: number, value: number) => {
    onChange(
      favorites.map((slot, index) => (index === slotIndex ? value : slot)),
    )
  }

  return (
    <div className="panel">
      <h3 className="panel__title">{title}</h3>
      <div className="favorites">
        {favorites.map((value, index) => (
          <div key={index} className="favorite-slot">
            <span className="favorite-slot__label">Slot {index + 1}</span>
            <select
              value={value}
              onChange={(event) => handleChange(index, Number(event.target.value))}
              className="favorite-slot__select"
              disabled={!patches.length}
            >
              {patches.length === 0 ? (
                <option value={value}>No patches available</option>
              ) : (
                patches.map((patch, patchIndex) => (
                  <option key={patchIndex} value={patchIndex}>
                    #{patchIndex + 1} {patch.name}
                  </option>
                ))
              )}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

type MetadataEditorProps = {
  patches: EditorPatch[]
  onMove?: (index: number, offset: number) => void
  onRemove?: (index: number) => void
  onRename?: (index: number, name: string) => void
  onComment?: (index: number, comment: string) => void
  onShuffle?: () => void
  onReverse?: () => void
  readOnly?: boolean
  formatBytes?: (value: number) => string
  renderActions?: (patch: EditorPatch, index: number) => ReactNode
  filter?: string
  onFilterChange?: (value: string) => void
}

const MetadataEditor = ({
  patches,
  onMove,
  onRemove,
  onRename,
  onComment,
  onShuffle,
  onReverse,
  readOnly,
  formatBytes,
  renderActions,
  filter,
  onFilterChange,
}: MetadataEditorProps) => {
  const isEditable = !readOnly && Boolean(onRename || onComment)
  const hasInteractiveControls = !readOnly && Boolean(onMove || onRemove)
  const hasCustomActions = Boolean(renderActions)
  const showControls = hasInteractiveControls || hasCustomActions
  const columnTemplate = showControls ? '60px 1fr 1fr 200px' : '60px 1fr 1fr'
  const filterValue = filter ?? ''
  const normalizedFilter = filterValue.trim().toLowerCase()
  const isFiltered = normalizedFilter.length > 0
  const disableOrdering = isFiltered

  const filteredItems = useMemo(() => {
    if (!normalizedFilter) {
      return patches.map((patch, index) => ({ patch, index }))
    }
    return patches
      .map((patch, index) => ({ patch, index }))
      .filter(({ patch }) => {
        const haystack = [patch.name, patch.comment, patch.sourceName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedFilter)
      })
  }, [patches, normalizedFilter])

  return (
    <div className="metadata">
      {isEditable && onRename && (
        <MetadataBulkActions
          items={filteredItems}
          onRename={onRename}
          onComment={onComment}
          onShuffle={disableOrdering ? undefined : onShuffle}
          onReverse={disableOrdering ? undefined : onReverse}
          disableOrdering={disableOrdering}
        />
      )}
      {onFilterChange && (
        <div className="metadata-filter">
          <input
            type="text"
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Filter patches"
            className="metadata-input"
          />
          {isFiltered && (
            <button type="button" className="btn btn--ghost" onClick={() => onFilterChange('')}>
              Clear
            </button>
          )}
          <span className="muted small">Showing {filteredItems.length} of {patches.length}</span>
        </div>
      )}
      <div className="metadata-table">
        <div className="metadata-head" style={{ gridTemplateColumns: columnTemplate }}>
          <span>#</span>
          <span>Name</span>
          <span>Comment</span>
          {showControls && <span>Controls</span>}
        </div>
        <ul>
          {filteredItems.map(({ patch, index }) => (
            <li
              key={`${index}-${patch.name}`}
              className="metadata-row"
              style={{ gridTemplateColumns: columnTemplate }}
            >
              <span className="metadata-index">{index + 1}</span>
              <div className="metadata-name">
                <div className="metadata-name__row">
                  {isEditable && onRename ? (
                    <input
                      type="text"
                      value={patch.name}
                      maxLength={12}
                      onChange={(event) => onRename(index, event.target.value)}
                      className="metadata-input"
                    />
                  ) : (
                    <span className="strong">{patch.name}</span>
                  )}
                  {patch.status && patch.status !== 'normal' && (
                    <span className={`status-badge status-badge--${patch.status}`}>
                      {patch.status === 'factory' ? 'Factory' : 'Init'}
                    </span>
                  )}
                </div>
                {!readOnly && patch.sourceName && (
                  <span className="muted small">
                    {patch.sourceName}
                    {patch.progBin && formatBytes ? ` • ${formatBytes(patch.progBin.length)}` : ''}
                  </span>
                )}
              </div>
              <div className="metadata-comment">
                {isEditable && onComment ? (
                  <input
                    type="text"
                    value={patch.comment ?? ''}
                    onChange={(event) => onComment(index, event.target.value)}
                    className="metadata-input"
                  />
                ) : (
                  <span className="muted small">{patch.comment ?? '—'}</span>
                )}
              </div>
              {showControls && (
                <div className="metadata-controls">
                  {hasInteractiveControls && (
                    <div className="metadata-controls__group">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => onMove && onMove(index, -1)}
                        disabled={!onMove || index === 0 || disableOrdering}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => onMove && onMove(index, 1)}
                        disabled={!onMove || index === patches.length - 1 || disableOrdering}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--danger"
                        onClick={() => onRemove && onRemove(index)}
                        disabled={!onRemove}
                        aria-label="Remove patch"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {renderActions && <div className="metadata-controls__group">{renderActions(patch, index)}</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

type MetadataBulkActionsProps = {
  items: Array<{ patch: EditorPatch; index: number }>
  onRename: (index: number, name: string) => void
  onComment?: (index: number, comment: string) => void
  onShuffle?: () => void
  onReverse?: () => void
  disableOrdering?: boolean
}

const MetadataBulkActions = ({ items, onRename, onComment, onShuffle, onReverse, disableOrdering }: MetadataBulkActionsProps) => {
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [search, setSearch] = useState('')
  const [replace, setReplace] = useState('')
  const [numberStart, setNumberStart] = useState(1)
  const [numberPadding, setNumberPadding] = useState(2)
  const [bulkComment, setBulkComment] = useState('')

  const applyPrefix = () => {
    if (!prefix) return
    items.forEach(({ patch, index }) => onRename(index, `${prefix}${patch.name}`))
    setPrefix('')
  }

  const applySuffix = () => {
    if (!suffix) return
    items.forEach(({ patch, index }) => onRename(index, `${patch.name}${suffix}`))
    setSuffix('')
  }

  const applyReplace = () => {
    if (!search) return
    items.forEach(({ patch, index }) =>
      onRename(index, patch.name.replaceAll(search, replace)),
    )
  }

  const applyNumbering = () => {
    const start = Number.isFinite(numberStart) ? numberStart : 1
    const padRaw = Number.isFinite(numberPadding) ? numberPadding : 2
    const padding = Math.max(0, Math.min(6, padRaw))
    items.forEach(({ patch, index }, order) => {
      const num = (start + order).toString().padStart(padding, '0')
      onRename(index, `${num} ${patch.name}`)
    })
  }

  const applyComment = () => {
    if (!onComment) return
    items.forEach(({ index }) => onComment(index, bulkComment))
    setBulkComment('')
  }

  return (
    <div className="metadata-bulk">
      <div className="metadata-bulk__group">
        <input
          type="text"
          placeholder="Add prefix"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
          className="metadata-input"
        />
        <button type="button" className="btn btn--ghost" onClick={applyPrefix} disabled={!prefix}>
          Apply
        </button>
      </div>
      <div className="metadata-bulk__group">
        <input
          type="text"
          placeholder="Add suffix"
          value={suffix}
          onChange={(event) => setSuffix(event.target.value)}
          className="metadata-input"
        />
        <button type="button" className="btn btn--ghost" onClick={applySuffix} disabled={!suffix}>
          Apply
        </button>
      </div>
      <div className="metadata-bulk__group">
        <input
          type="text"
          placeholder="Find"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="metadata-input"
        />
        <input
          type="text"
          placeholder="Replace"
          value={replace}
          onChange={(event) => setReplace(event.target.value)}
          className="metadata-input"
        />
        <button type="button" className="btn btn--ghost" onClick={applyReplace} disabled={!search}>
          Replace
        </button>
      </div>
      <div className="metadata-bulk__group">
        <label className="muted small" htmlFor="bulk-number-start">
          Numbering
        </label>
        <input
          id="bulk-number-start"
          type="number"
          value={numberStart}
          onChange={(event) => setNumberStart(Number(event.target.value))}
          className="metadata-input metadata-input--short"
        />
        <input
          type="number"
          value={numberPadding}
          onChange={(event) => setNumberPadding(Number(event.target.value))}
          className="metadata-input metadata-input--short"
          min={0}
          max={6}
        />
        <button type="button" className="btn btn--ghost" onClick={applyNumbering}>
          Prefix numbers
        </button>
      </div>
      <div className="metadata-bulk__group">
        <input
          type="text"
          placeholder="Set comment for all"
          value={bulkComment}
          onChange={(event) => setBulkComment(event.target.value)}
          className="metadata-input"
        />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={applyComment}
          disabled={!onComment || items.length === 0}
        >
          Apply comment
        </button>
      </div>
      <div className="metadata-bulk__group">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onShuffle}
          disabled={!onShuffle || disableOrdering}
        >
          Shuffle order
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onReverse}
          disabled={!onReverse || disableOrdering}
        >
          Reverse order
        </button>
      </div>
    </div>
  )
}

type PatchDetailsPanelProps = {
  detail: { patch: EditorPatch; context: 'collection' | 'build' }
  onClose: () => void
}

const PatchDetailsPanel = ({ detail, onClose }: PatchDetailsPanelProps) => {
  const { patch, context } = detail
  const progInfoEntries = useMemo(() => parseProgInfoEntries(patch.progInfoXml), [patch.progInfoXml])
  const summaryCategories = useMemo(() => getPatchSummary(patch), [patch])

  return (
    <div className="details-overlay" role="dialog" aria-modal="true">
      <div className="details-panel">
        <div className="details-header">
          <div>
            <h3>{patch.name}</h3>
            <p className="muted small">
              {context === 'collection' ? 'Imported library' : 'Build workspace'} · Index {patch.index + 1}
            </p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="details-grid">
          <div>
            <span className="details-label">Status</span>
            <span>{patch.status === 'factory' ? 'Factory' : patch.status === 'init' ? 'Init' : 'User'}</span>
          </div>
          <div>
            <span className="details-label">Hash</span>
            <span className="mono small">{patch.hash}</span>
          </div>
          <div>
            <span className="details-label">Comment</span>
            <span>{patch.comment ?? '—'}</span>
          </div>
          <div>
            <span className="details-label">Programmer</span>
            <span>{patch.programmer ?? '—'}</span>
          </div>
          {patch.sourceName && (
            <div>
              <span className="details-label">Source file</span>
              <span>{patch.sourceName}</span>
            </div>
          )}
        </div>

        {summaryCategories.length > 0 && (
          <div className="details-section">
            <span className="details-label">Patch summary</span>
            <div className="summary-columns">
              {summaryCategories.map((category) => (
                <div key={category.label} className="summary-column">
                  <h4>{category.label}</h4>
                  <dl>
                    {category.rows.map((row) => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}

        {progInfoEntries.length > 0 && (
          <div className="details-section">
            <span className="details-label">Program info</span>
            <dl className="details-proginfo">
              {progInfoEntries.map(({ key, value }) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}

const ValidationCallout = ({ title, items }: { title: string; items: string[] }) => (
  <div className="validation-callout">
    <h4>{title}</h4>
    <ul>
      {items.map((item, idx) => (
        <li key={idx}>{item}</li>
      ))}
    </ul>
  </div>
)
