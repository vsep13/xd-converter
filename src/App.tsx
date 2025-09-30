import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  listCachedFiles,
  saveCachedFile,
  loadCachedFile,
  removeCachedFile,
  clearCachedFiles,
  type CachedFileMeta,
} from './lib/cache'
import './App.css'
import MidiLibrarianPanel from './MidiLibrarianPanel'
import PatchVisualPanel from './components/PatchVisualPanel'
import { usePatchPreview } from './hooks/usePatchPreview'
import { getPatchSummary, type PatchSummaryCategory } from './utils/patchSummary'
import {
  RANDOMIZER_GROUPS,
  createDefaultRandomizerConfig,
  getRandomizerFieldValue,
  normalizeRandomizerConfig,
  randomizePatchParameters,
  type RandomizerConfig,
  type RandomizerRange,
} from './utils/patchRandomizer'
import { createSummaryExportBlob, toFilename } from './utils/summaryExport'
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
  type XdCollectionMetadata,
  type XdCollectionKind,
  type XdUserData,
  type UserDataEntry,
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

const userDataGroupDefinitions: Array<{ key: keyof XdUserData; label: string }> = [
  { key: 'oscillators', label: 'User oscillators' },
  { key: 'modEffects', label: 'User mod FX' },
  { key: 'delayEffects', label: 'User delay FX' },
  { key: 'reverbEffects', label: 'User reverb FX' },
]

const createEmptyUserData = (): XdUserData => ({
  oscillators: [],
  modEffects: [],
  delayEffects: [],
  reverbEffects: [],
})

const mergeUserData = (current: XdUserData | null, next?: XdUserData): XdUserData | null => {
  if (!next) return current
  const base = current
    ? {
        oscillators: [...current.oscillators],
        modEffects: [...current.modEffects],
        delayEffects: [...current.delayEffects],
        reverbEffects: [...current.reverbEffects],
      }
    : createEmptyUserData()

  const mergeCategory = (existing: UserDataEntry[], incoming: UserDataEntry[]) => {
    const map = new Map(existing.map((entry) => [entry.path, entry]))
    incoming.forEach((entry) => {
      if (!map.has(entry.path)) {
        map.set(entry.path, entry)
      }
    })
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path))
  }

  const merged: XdUserData = {
    oscillators: mergeCategory(base.oscillators, next.oscillators),
    modEffects: mergeCategory(base.modEffects, next.modEffects),
    delayEffects: mergeCategory(base.delayEffects, next.delayEffects),
    reverbEffects: mergeCategory(base.reverbEffects, next.reverbEffects),
  }

  if (
    !merged.oscillators.length &&
    !merged.modEffects.length &&
    !merged.delayEffects.length &&
    !merged.reverbEffects.length
  ) {
    return null
  }

  return merged
}

const hasUserDataEntries = (data?: XdUserData | null) =>
  Boolean(
    data &&
      (data.oscillators.length || data.modEffects.length || data.delayEffects.length || data.reverbEffects.length),
  )

const getUserDataFilename = (path: string) => {
  const separatorMatch = path.match(/[^/\\]+$/)
  return separatorMatch ? separatorMatch[0] : path
}

type UserDataPanelProps = {
  title: string
  description?: string
  data: XdUserData | null | undefined
  formatBytes: (value: number) => string
  onDownload: (entry: UserDataEntry) => void
}

const UserDataPanel = ({ title, description, data, formatBytes, onDownload }: UserDataPanelProps) => {
  if (!hasUserDataEntries(data)) return null

  const groups = userDataGroupDefinitions
    .map((definition) => ({ ...definition, entries: data?.[definition.key] ?? [] }))
    .filter((group) => group.entries.length > 0)

  if (!groups.length) return null

  return (
    <div className="panel">
      <h3 className="panel__title">{title}</h3>
      {description && <p className="muted small">{description}</p>}
      <div className="user-data">
        {groups.map((group) => (
          <div key={group.key} className="user-data__group">
            <h4>{group.label}</h4>
            <ul className="user-data__list">
              {group.entries.map((entry) => {
                const filename = getUserDataFilename(entry.path)
                const showFullPath = filename !== entry.path
                return (
                  <li key={entry.path} className="user-data__item">
                    <div className="user-data__meta">
                      <span className="mono small">{filename}</span>
                      {showFullPath && <span className="muted small">{entry.path}</span>}
                    </div>
                    <div className="user-data__actions">
                      <span className="muted small">{formatBytes(entry.data.byteLength)}</span>
                      <button type="button" className="btn btn--ghost" onClick={() => onDownload(entry)}>
                        Download
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
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
type PatchWithSource = RawXdPatch & { sourceName?: string }

type EditorPatch = RawXdPatch & { sourceName?: string }

type UndoSnapshot = {
  patches: EditorPatch[]
  favorites: number[]
}

type UndoCollectionSnapshot = {
  collection: XdCollection | null
  favorites: number[]
  presetFields: PresetInformationFields
}

type UndoState = {
  kind: 'workspace' | 'collection' | 'transfer'
  message: string
  removedCount?: number
  workspace?: UndoSnapshot
  collection?: UndoCollectionSnapshot
  secondary?: UndoCollectionSnapshot
}

const clonePatchesWithIndexes = (patches: EditorPatch[]) =>
  patches.map((patch, index) => ({ ...patch, index }))

const cloneCollectionState = (collection: XdCollection): XdCollection => ({
  patches: collection.patches.map((patch, index) => ({ ...patch, index })),
  metadata: {
    ...collection.metadata,
    favorites: collection.metadata.favorites ? [...collection.metadata.favorites] : undefined,
    presetFields: collection.metadata.presetFields ? { ...collection.metadata.presetFields } : undefined,
    warnings: collection.metadata.warnings ? [...collection.metadata.warnings] : undefined,
  },
})

const adjustFavoritesAfterRemoval = (favorites: number[], removedIndices: number[], nextLength: number) => {
  if (!favorites.length) return normalizeFavoriteSlots([], nextLength)
  const normalizedRemoved = [...removedIndices].sort((a, b) => a - b)
  const removalSet = new Set(normalizedRemoved)
  const computeShift = (slot: number) => {
    let shift = 0
    for (const removedIndex of normalizedRemoved) {
      if (removedIndex < slot) shift += 1
    }
    return shift
  }

  const adjusted = favorites.map((slot) => {
    if (removalSet.has(slot)) return 0
    const shift = computeShift(slot)
    return Math.max(0, slot - shift)
  })

  return normalizeFavoriteSlots(adjusted, nextLength)
}

const createBlankCollection = (name = 'Custom library'): XdCollection => ({
  patches: [],
  metadata: {
    kind: 'library',
    fileInformationXml: '',
    favoriteDataPresent: false,
    rawFiles: {},
    sourceName: name,
    warnings: [],
    presetFields: undefined,
    favorites: undefined,
  },
})

const getPatchKey = (patch: RawXdPatch) => `${patch.hash}-${patch.index}`

type IconButtonProps = {
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}

const IconButton = ({ label, onClick, disabled, className, children }: IconButtonProps) => (
  <button
    type="button"
    className={`metadata-control${className ? ` ${className}` : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
  >
    {children}
  </button>
)

const IconChevronUp = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3.5 8.5L7 5l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3.5 5.5L7 9l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M5.2 3.5h3.6m-5.1 1h6.6l-.4 6.15a1 1 0 01-.99.93H6.09a1 1 0 01-.99-.93L4.7 4.5zm1.5 0V3.2c0-.39.32-.7.7-.7h1.6c.39 0 .7.31.7.7v1.3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconInfo = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7 6.2v3.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="7" cy="4.6" r="0.6" fill="currentColor" />
  </svg>
)

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M5 4.2l4.5 2.8L5 9.8V4.2z" fill="currentColor" />
  </svg>
)

const IconStop = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <rect x="4.2" y="4.2" width="5.6" height="5.6" rx="0.8" fill="currentColor" />
  </svg>
)

const IconDots = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="4" cy="8" r="1.5" fill="currentColor" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <circle cx="12" cy="8" r="1.5" fill="currentColor" />
  </svg>
)

type ActionMenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
}

type ActionMenuProps = {
  items: ActionMenuItem[]
  align?: 'left' | 'right'
}

const ActionMenu = ({ items, align = 'right' }: ActionMenuProps) => {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const closeMenu = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, closeMenu])

  if (!items.length) return null

  return (
    <div className="action-menu" ref={menuRef}>
      <button
        type="button"
        className="btn btn--ghost action-menu__toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        title="More actions"
      >
        <IconDots />
      </button>
      {open && (
        <div
          role="menu"
          className={`action-menu__content action-menu__content--${align}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="action-menu__item"
              onClick={() => {
                closeMenu()
                item.onSelect()
              }}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


type RandomizerAction = 'selected' | 'duplicate' | 'all'
type LibraryKind = 'primary' | 'secondary'

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
  const [secondaryCollection, setSecondaryCollection] = useState<XdCollection | null>(null)
  const [secondaryError, setSecondaryError] = useState<string | null>(null)
  const [secondaryPresetFields, setSecondaryPresetFields] = useState<PresetInformationFields>(createDefaultPresetFields)
  const [secondaryFavorites, setSecondaryFavorites] = useState<number[]>(defaultFavoriteSlots(0))
  const [secondaryFilter, setSecondaryFilter] = useState('')
  const [secondaryWarnings, setSecondaryWarnings] = useState<string[]>([])

  const [patches, setPatches] = useState<PatchWithSource[]>([])
  const [patchError, setPatchError] = useState<string | null>(null)
  const [outputKind, setOutputKind] = useState<XdCollectionKind>('library')
  const [buildPresetFields, setBuildPresetFields] = useState<PresetInformationFields>(createDefaultPresetFields)
  const [collectionFavorites, setCollectionFavorites] = useState<number[]>(defaultFavoriteSlots(0))
  const [buildFavorites, setBuildFavorites] = useState<number[]>(defaultFavoriteSlots(0))
  const [undoState, setUndoState] = useState<UndoState | null>(null)
  const [workspaceUserData, setWorkspaceUserData] = useState<XdUserData | null>(null)
  const [randomizerConfig, setRandomizerConfig] = useState<RandomizerConfig>(createDefaultRandomizerConfig)
  const [randomizerTargetIndex, setRandomizerTargetIndex] = useState(0)
  const [templates, setTemplates] = useState<PresetTemplate[]>([])
  const [collectionFilter, setCollectionFilter] = useState('')
  const [buildFilter, setBuildFilter] = useState('')
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const [cachedLibraries, setCachedLibraries] = useState<CachedFileMeta[]>([])
  const [loadingCacheId, setLoadingCacheId] = useState<string | null>(null)
  const [selectedPatch, setSelectedPatch] = useState<
    { patch: EditorPatch; context: 'collection' | 'secondary' | 'build'; peers: EditorPatch[] } | null
  >(null)
  const {
    supported: previewSupported,
    status: previewStatus,
    error: previewError,
    play: playPreview,
    stop: stopPreview,
  } = usePatchPreview()
  const [previewActiveKey, setPreviewActiveKey] = useState<string | null>(null)
  const [previewNotice, setPreviewNotice] = useState<string | null>(null)

  const getLibraryContext = (kind: LibraryKind) => {
    if (kind === 'primary') {
      return {
        kind,
        collection,
        setCollection,
        favorites: collectionFavorites,
        setFavorites: setCollectionFavorites,
        presetFields: collectionPresetFields,
        setPresetFields: setCollectionPresetFields,
        filter: collectionFilter,
        setFilter: setCollectionFilter,
        warnings: validationWarnings,
        setWarnings: setValidationWarnings,
        error: collectionError,
        setError: setCollectionError,
        label: collection?.metadata.sourceName ?? 'Primary library',
      }
    }

    return {
      kind,
      collection: secondaryCollection,
      setCollection: setSecondaryCollection,
      favorites: secondaryFavorites,
      setFavorites: setSecondaryFavorites,
      presetFields: secondaryPresetFields,
      setPresetFields: setSecondaryPresetFields,
      filter: secondaryFilter,
      setFilter: setSecondaryFilter,
      warnings: secondaryWarnings,
      setWarnings: setSecondaryWarnings,
      error: secondaryError,
      setError: setSecondaryError,
      label: secondaryCollection?.metadata.sourceName ?? 'Reference library',
    }
  }
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
  const secondaryFactoryCount = useMemo(
    () => (secondaryCollection ? secondaryCollection.patches.filter((p) => p.status === 'factory').length : 0),
    [secondaryCollection],
  )
  const secondaryInitCount = useMemo(
    () => (secondaryCollection ? secondaryCollection.patches.filter((p) => p.status === 'init').length : 0),
    [secondaryCollection],
  )
  const secondaryStatusSummary = useMemo(() => {
    const parts: string[] = []
    if (secondaryFactoryCount > 0) parts.push(`${secondaryFactoryCount} factory`)
    if (secondaryInitCount > 0) parts.push(`${secondaryInitCount} init`)
    return parts
  }, [secondaryFactoryCount, secondaryInitCount])
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
    if (!secondaryCollection) {
      setSecondaryFavorites(defaultFavoriteSlots(0))
      setSecondaryPresetFields(createDefaultPresetFields())
      setSecondaryFilter('')
      setSecondaryWarnings([])
      return
    }

    const defaults = createDefaultPresetFields()
    defaults.numOfProg = String(secondaryCollection.patches.length)
    if (secondaryCollection.metadata.presetFields) {
      setSecondaryPresetFields({ ...defaults, ...secondaryCollection.metadata.presetFields })
    } else {
      setSecondaryPresetFields(defaults)
    }

    setSecondaryFavorites(
      normalizeFavoriteSlots(secondaryCollection.metadata.favorites, secondaryCollection.patches.length),
    )
    setSecondaryWarnings(secondaryCollection.metadata.warnings ?? [])
  }, [secondaryCollection])

  useEffect(() => {
    setPatchError(null)
  }, [patches])

  useEffect(() => {
    setRandomizerTargetIndex((current) => {
      if (patches.length === 0) return 0
      return Math.min(current, patches.length - 1)
    })
  }, [patches.length])

  useEffect(() => {
    if (!collection?.metadata.userData) return
    setWorkspaceUserData((prev) => mergeUserData(prev, collection.metadata.userData))
  }, [collection])

  useEffect(() => {
    if (!secondaryCollection?.metadata.userData) return
    setWorkspaceUserData((prev) => mergeUserData(prev, secondaryCollection.metadata.userData))
  }, [secondaryCollection])

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

  useEffect(() => {
    if (previewStatus === 'idle' && previewActiveKey !== null) {
      setPreviewActiveKey(null)
    }
  }, [previewStatus, previewActiveKey])

  useEffect(() => {
    if (previewError) {
      setPreviewNotice(previewError)
    }
  }, [previewError])

  useEffect(() => {
    if (previewStatus === 'playing') {
      setPreviewNotice(null)
    }
  }, [previewStatus])

  const handleMidiPatchFetched = useCallback((patch: RawXdPatch) => {
    setPatchError(null)
    setPatches((prev) => {
      const nextIndex = prev.length
      const normalized: PatchWithSource = { ...patch, index: nextIndex, sourceName: 'MIDI' }
      return [...prev, normalized]
    })
  }, [])

  const handleMidiCollectionDumped = useCallback((patchList: RawXdPatch[], label: string) => {
    const normalized = patchList.map((patch, idx) => ({ ...patch, index: idx }))
    const metadata: XdCollectionMetadata = {
      kind: 'library',
      fileInformationXml: '',
      favoriteDataPresent: false,
      rawFiles: {},
      sourceName: label,
      warnings: ['Captured via MIDI dump – metadata limited'],
    }
    setCollection({ patches: normalized, metadata })
    setCollectionError(null)
    setCollectionPresetFields((prev) => ({ ...prev, numOfProg: String(normalized.length) }))
    setCollectionFavorites(defaultFavoriteSlots(normalized.length))
    setCollectionFilter('')
  }, [])

  const handleTogglePreview = useCallback(
    (patch: EditorPatch) => {
      const key = getPatchKey(patch)
      if (!previewSupported) {
        setPreviewNotice('Audio preview needs a browser that supports the Web Audio API.')
        return
      }
      if (previewActiveKey === key && (previewStatus === 'playing' || previewStatus === 'pending')) {
        stopPreview()
        setPreviewActiveKey(null)
        return
      }
      setPreviewNotice(null)
      setPreviewActiveKey(key)
      playPreview(patch).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to start audio preview'
        setPreviewNotice(message)
        setPreviewActiveKey(null)
      })
    },
    [playPreview, previewActiveKey, previewStatus, previewSupported, stopPreview],
  )

  const renderPreviewControl = useCallback(
    (patch: EditorPatch) => {
      const key = getPatchKey(patch)
      const hasProgramData = Boolean(patch.progBin?.length)
      const isCurrent = previewActiveKey === key
      const isPending = isCurrent && previewStatus === 'pending'
      const isPlaying = isCurrent && previewStatus === 'playing'
      const busy = previewStatus === 'pending' && !isPending
      const disabled = !hasProgramData || busy
      const label = isPending ? 'Preparing…' : isPlaying ? 'Stop preview' : 'Preview'
      const title = !previewSupported ? 'Preview requires a browser that supports the Web Audio API.' : label
      return (
        <button
          type="button"
          className={`btn btn--ghost preview-button${isPlaying ? ' is-active' : ''}`}
          onClick={() => handleTogglePreview(patch)}
          disabled={disabled}
          aria-pressed={isPlaying}
          title={title}
        >
          {isPlaying ? <IconStop /> : <IconPlay />}
          <span>{label}</span>
        </button>
      )
    },
    [handleTogglePreview, previewActiveKey, previewStatus, previewSupported],
  )

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

  const handleSecondaryCollectionUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSecondaryError(null)
    setSecondaryWarnings([])
    try {
      const buffer = await readFileAsArrayBuffer(file)
      const parsed = parseXdCollection(buffer, file.name)
      setSecondaryWarnings(parsed.metadata.warnings ?? [])
      setSecondaryCollection(parsed)
    } catch (err) {
      console.error(err)
      setSecondaryCollection(null)
      setSecondaryError(err instanceof Error ? err.message : 'Failed to parse reference archive')
    } finally {
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

  const reorderWorkspacePatch = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return
    setPatches((prev) => {
      if (sourceIndex < 0 || sourceIndex >= prev.length) return prev
      let nextTarget = targetIndex
      if (nextTarget < 0) nextTarget = 0
      if (nextTarget >= prev.length) nextTarget = prev.length - 1

      const next = [...prev]
      const [item] = next.splice(sourceIndex, 1)
      next.splice(nextTarget, 0, item)

      const mapping = new Map<number, number>()
      next.forEach((patch, newIndex) => {
        const oldIndex = prev.indexOf(patch)
        if (oldIndex !== -1) mapping.set(oldIndex, newIndex)
      })

      setBuildFavorites((favorites) =>
        normalizeFavoriteSlots(
          favorites.map((slot) => {
            const mapped = mapping.get(slot)
            return typeof mapped === 'number' ? mapped : slot
          }),
          next.length,
        ),
      )

      return clonePatchesWithIndexes(next)
    })
  }

  const movePatch = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= patches.length) return
    reorderWorkspacePatch(index, target)
  }

  const removePatches = (indices: number[]) => {
    if (!indices.length || !patches.length) return
    const normalized = Array.from(new Set(indices.filter((idx) => idx >= 0 && idx < patches.length))).sort((a, b) => a - b)
    if (!normalized.length) return

    const removalSet = new Set(normalized)
    const nextRaw = patches.filter((_, idx) => !removalSet.has(idx))
    const nextPatches = clonePatchesWithIndexes(nextRaw)
    const nextFavorites = adjustFavoritesAfterRemoval(buildFavorites, normalized, nextPatches.length)

    setUndoState({
      kind: 'workspace',
      message:
        normalized.length === 1
          ? 'Removed 1 patch from the build workspace'
          : `Removed ${normalized.length} patches from the build workspace`,
      removedCount: normalized.length,
      workspace: {
        patches: clonePatchesWithIndexes(patches),
        favorites: [...buildFavorites],
      },
    })

    setBuildFavorites(nextFavorites)
    setPatches(nextPatches)
  }

  const removeLibraryPatches = (kind: LibraryKind, indices: number[]) => {
    const { collection: current, setCollection: updateCollection, favorites, setFavorites, presetFields, setPresetFields, label } = getLibraryContext(kind)
    if (!indices.length || !current) return
    if (!current.patches.length) return
    const normalized = Array.from(new Set(indices.filter((idx) => idx >= 0 && idx < current.patches.length))).sort((a, b) => a - b)
    if (!normalized.length) return

    const removalSet = new Set(normalized)
    const remaining = current.patches.filter((_, idx) => !removalSet.has(idx))
    const nextPatches = remaining.map((patch, index) => ({ ...patch, index }))

    const currentFavorites = normalizeFavoriteSlots(
      current.metadata.favorites ?? favorites,
      current.patches.length,
    )

    const nextFavorites = adjustFavoritesAfterRemoval(currentFavorites, normalized, nextPatches.length)
    const nextPresetFields = { ...presetFields, numOfProg: String(nextPatches.length) }

    const nextCollection: XdCollection = {
      patches: nextPatches,
      metadata: {
        ...current.metadata,
        favorites: nextFavorites,
        presetFields: {
          ...current.metadata.presetFields,
          ...nextPresetFields,
        },
      },
    }

    const snapshot: UndoCollectionSnapshot = {
      collection: cloneCollectionState(current),
      favorites: [...currentFavorites],
      presetFields: { ...presetFields },
    }

    setUndoState({
      kind: 'collection',
      message:
        normalized.length === 1
          ? `Removed 1 patch from ${label}`
          : `Removed ${normalized.length} patches from ${label}`,
      removedCount: normalized.length,
      [kind === 'primary' ? 'collection' : 'secondary']: snapshot,
    })

    setFavorites(nextFavorites)
    setPresetFields(nextPresetFields)
    updateCollection(nextCollection)
  }

  const reorderLibraryPatch = (kind: LibraryKind, sourceIndex: number, targetIndex: number) => {
    const { collection: current, setCollection: updateCollection, favorites, setFavorites } = getLibraryContext(kind)
    if (!current) return
    if (sourceIndex === targetIndex) return
    if (sourceIndex < 0 || sourceIndex >= current.patches.length) return
    let nextTarget = targetIndex
    if (nextTarget < 0) nextTarget = 0
    if (nextTarget >= current.patches.length) nextTarget = current.patches.length - 1

    const next = [...current.patches]
    const [item] = next.splice(sourceIndex, 1)
    next.splice(nextTarget, 0, item)

    const mapping = new Map<number, number>()
    next.forEach((patch, newIndex) => {
      const oldIndex = current.patches.indexOf(patch)
      if (oldIndex !== -1) mapping.set(oldIndex, newIndex)
    })

    const reindexed = next.map((patch, newIndex) => ({ ...patch, index: newIndex }))

    const currentFavorites = normalizeFavoriteSlots(
      current.metadata.favorites ?? favorites,
      current.patches.length,
    )

    const nextFavorites = normalizeFavoriteSlots(
      currentFavorites.map((slot) => {
        const mapped = mapping.get(slot)
        return typeof mapped === 'number' ? mapped : slot
      }),
      reindexed.length,
    )

    setFavorites(nextFavorites)

    updateCollection({
      patches: reindexed,
      metadata: {
        ...current.metadata,
        favorites: nextFavorites,
      },
    })
  }

  const moveLibraryPatchWithinLibrary = (kind: LibraryKind, index: number, offset: number) => {
    const context = getLibraryContext(kind)
    const current = context.collection
    if (!current) return
    const target = index + offset
    if (target < 0 || target >= current.patches.length) return
    reorderLibraryPatch(kind, index, target)
  }

  const moveLibraryPatchToWorkspace = (kind: LibraryKind, index: number) => {
    const context = getLibraryContext(kind)
    const current = context.collection
    if (!current) return
    const patch = current.patches[index]
    if (!patch) return

    const prevWorkspaceSnapshot = clonePatchesWithIndexes(patches)
    const prevWorkspaceFavorites = [...buildFavorites]

    const workspacePatch: EditorPatch = {
      ...patch,
      sourceName: patch.sourceName ?? current.metadata.sourceName,
      index: patches.length,
    }

    const nextWorkspacePatches = clonePatchesWithIndexes([...patches, workspacePatch])
    const nextWorkspaceFavorites = normalizeFavoriteSlots(buildFavorites, nextWorkspacePatches.length)

    setUndoState({
      kind: 'transfer',
      message: `Copied 1 patch from ${context.label} to the build workspace`,
      removedCount: 1,
      workspace: {
        patches: prevWorkspaceSnapshot,
        favorites: prevWorkspaceFavorites,
      },
    })

    setPatches(nextWorkspacePatches)
    setBuildFavorites(nextWorkspaceFavorites)
  }

  const moveWorkspacePatchToLibrary = (kind: LibraryKind, index: number) => {
    const patch = patches[index]
    if (!patch) return

    const prevWorkspaceSnapshot = clonePatchesWithIndexes(patches)
    const prevWorkspaceFavorites = [...buildFavorites]

    const remainingWorkspace = patches.filter((_, idx) => idx !== index)
    const nextWorkspacePatches = clonePatchesWithIndexes(remainingWorkspace)
    const nextWorkspaceFavorites = adjustFavoritesAfterRemoval(buildFavorites, [index], nextWorkspacePatches.length)

    const context = getLibraryContext(kind)
    const current = context.collection ?? createBlankCollection(kind === 'primary' ? 'Custom library' : 'Reference library')
    const createdBlank = !context.collection

    const baseFavorites = normalizeFavoriteSlots(
      current.metadata.favorites ?? (context.collection ? context.favorites : defaultFavoriteSlots(current.patches.length)),
      current.patches.length,
    )

    const basePresetFields = context.collection
      ? { ...context.presetFields }
      : (() => {
          const defaults = createDefaultPresetFields()
          defaults.numOfProg = String(current.patches.length)
          return defaults
        })()

    const { sourceName, ...rawPatch } = patch
    void sourceName
    const appendedPatch: RawXdPatch = { ...rawPatch, index: current.patches.length }
    const combinedPatches = [...current.patches.map((item) => ({ ...item })), appendedPatch]
    const nextLibraryPatches = combinedPatches.map((item, idx) => ({ ...item, index: idx }))
    const nextLibraryFavorites = normalizeFavoriteSlots(baseFavorites, nextLibraryPatches.length)
    const nextPresetFields = { ...basePresetFields, numOfProg: String(nextLibraryPatches.length) }

    const nextCollection: XdCollection = {
      patches: nextLibraryPatches,
      metadata: {
        ...current.metadata,
        favorites: nextLibraryFavorites,
        presetFields: {
          ...current.metadata.presetFields,
          ...nextPresetFields,
        },
      },
    }

    const previousSnapshot: UndoCollectionSnapshot = context.collection
      ? {
          collection: cloneCollectionState(context.collection),
          favorites: normalizeFavoriteSlots(
            context.collection.metadata.favorites ?? context.favorites,
            context.collection.patches.length,
          ),
          presetFields: { ...context.presetFields },
        }
      : {
          collection: null,
          favorites: defaultFavoriteSlots(0),
          presetFields: createDefaultPresetFields(),
        }

    setUndoState({
      kind: 'transfer',
      message: `Moved 1 patch from the build workspace to ${context.label}`,
      removedCount: 1,
      workspace: {
        patches: prevWorkspaceSnapshot,
        favorites: prevWorkspaceFavorites,
      },
      [kind === 'primary' ? 'collection' : 'secondary']: previousSnapshot,
    })

    setPatches(nextWorkspacePatches)
    setBuildFavorites(nextWorkspaceFavorites)
    context.setCollection(nextCollection)
    context.setFavorites(nextLibraryFavorites)
    context.setPresetFields(nextPresetFields)
    if (createdBlank) {
      context.setWarnings([])
      context.setError(null)
      context.setFilter('')
    }
  }

  const startBlankLibrary = (kind: LibraryKind) => {
    const context = getLibraryContext(kind)
    const defaults = createDefaultPresetFields()
    defaults.numOfProg = '0'
    const blank = createBlankCollection(kind === 'primary' ? 'Custom library' : 'Reference library')
    blank.metadata.presetFields = defaults
    blank.metadata.favorites = defaultFavoriteSlots(0)
    context.setCollection(blank)
    context.setFavorites(defaultFavoriteSlots(0))
    context.setPresetFields(defaults)
    context.setWarnings([])
    context.setError(null)
    context.setFilter('')
  }

  const handleStartBlankLibrary = () => startBlankLibrary('primary')
  const handleStartSecondaryBlankLibrary = () => startBlankLibrary('secondary')

  const handleClearSecondaryLibrary = () => {
    setSecondaryCollection(null)
    setSecondaryFavorites(defaultFavoriteSlots(0))
    setSecondaryPresetFields(createDefaultPresetFields())
    setSecondaryWarnings([])
    setSecondaryError(null)
    setSecondaryFilter('')
  }

  const handleUndoRemoval = () => {
    if (!undoState) return

    if (undoState.workspace) {
      setPatches(clonePatchesWithIndexes(undoState.workspace.patches))
      const restoredFavorites = normalizeFavoriteSlots(
        undoState.workspace.favorites,
        undoState.workspace.patches.length,
      )
      setBuildFavorites(restoredFavorites)
    }

    if (undoState.collection) {
      if (undoState.collection.collection) {
        const restoredCollection = cloneCollectionState(undoState.collection.collection)
        const restoredFavorites = normalizeFavoriteSlots(
          undoState.collection.favorites,
          restoredCollection.patches.length,
        )
        restoredCollection.metadata = {
          ...restoredCollection.metadata,
          favorites: restoredFavorites,
          presetFields: { ...undoState.collection.presetFields },
        }
        setCollection(restoredCollection)
        setCollectionFavorites(restoredFavorites)
        setCollectionPresetFields({ ...undoState.collection.presetFields })
      } else {
        setCollection(null)
        setCollectionFavorites(defaultFavoriteSlots(0))
        setCollectionPresetFields(createDefaultPresetFields())
      }
    }

    if (undoState.secondary) {
      if (undoState.secondary.collection) {
        const restoredSecondary = cloneCollectionState(undoState.secondary.collection)
        const restoredFavorites = normalizeFavoriteSlots(
          undoState.secondary.favorites,
          restoredSecondary.patches.length,
        )
        restoredSecondary.metadata = {
          ...restoredSecondary.metadata,
          favorites: restoredFavorites,
          presetFields: { ...undoState.secondary.presetFields },
        }
        setSecondaryCollection(restoredSecondary)
        setSecondaryFavorites(restoredFavorites)
        setSecondaryPresetFields({ ...undoState.secondary.presetFields })
      } else {
        setSecondaryCollection(null)
        setSecondaryFavorites(defaultFavoriteSlots(0))
        setSecondaryPresetFields(createDefaultPresetFields())
        setSecondaryFilter('')
        setSecondaryWarnings([])
        setSecondaryError(null)
      }
    }

    setUndoState(null)
  }

  const handleDismissUndo = () => setUndoState(null)

  const removePatch = (index: number) => {
    removePatches([index])
  }

  const handleRandomizerRangeChange = useCallback((key: string, range: RandomizerRange) => {
    setRandomizerConfig((prev) => normalizeRandomizerConfig({ ...prev, [key]: range }))
  }, [])

  const handleRandomizerReset = useCallback(() => {
    setRandomizerConfig(createDefaultRandomizerConfig())
  }, [])

  const handleRandomizerApply = useCallback(
    (action: RandomizerAction) => {
      if (!patches.length) return
      const normalized = normalizeRandomizerConfig(randomizerConfig)
      setRandomizerConfig(normalized)

      if (action === 'selected') {
        setPatches((prev) =>
          prev.map((patch, idx) => {
            if (idx !== randomizerTargetIndex) return patch
            const randomized = randomizePatchParameters(patch, normalized)
            return { ...randomized, sourceName: patch.sourceName }
          }),
        )
        return
      }

      if (action === 'duplicate') {
        setPatches((prev) => {
          const base = prev[randomizerTargetIndex]
          if (!base) return prev
          const randomized = randomizePatchParameters(base, normalized)
          const clone: PatchWithSource = {
            ...randomized,
            index: prev.length,
            sourceName: base.sourceName,
          }
          return [...prev, clone]
        })
        setRandomizerTargetIndex(patches.length)
        return
      }

      if (action === 'all') {
        setPatches((prev) =>
          prev.map((patch) => {
            const randomized = randomizePatchParameters(patch, normalized)
            return { ...randomized, sourceName: patch.sourceName }
          }),
        )
      }
    },
    [patches.length, randomizerConfig, randomizerTargetIndex],
  )

  const handleCollectionDownload = (kind: XdCollectionKind) => {
    if (!collection) return
    try {
      const options: BuildCollectionOptions = {
        kind,
        presetInfo: kind === 'preset' ? { ...collectionPresetFields, numOfProg: String(collection.patches.length) } : undefined,
        favorites: kind === 'library' ? collectionFavorites : undefined,
        userData: collection.metadata.userData,
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

  const handleShowDetails = (patch: EditorPatch, context: 'collection' | 'secondary' | 'build') => {
    let peers: EditorPatch[]
    if (context === 'collection') {
      peers = collection?.patches ?? []
    } else if (context === 'secondary') {
      peers = secondaryCollection?.patches ?? []
    } else {
      peers = patches
    }
    setSelectedPatch({ patch, context, peers })
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

  const handleDownloadUserData = (entry: UserDataEntry) => {
    try {
      const filename = getUserDataFilename(entry.path)
      triggerDownload(bufferToBlob(entry.data), filename)
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Failed to download user data file'
      setCollectionError(message)
      setPatchError(message)
    }
  }

  const handleExportCollectionSummaries = (format: 'csv' | 'json') => {
    if (!collection) return
    if (collection.patches.length === 0) {
      setCollectionError('No patch summaries available to export')
      return
    }

    try {
      const sourceName = collection.metadata.sourceName ?? collectionPresetFields.name
      const filenameBase = toFilename(sourceName, 'minilogue-xd-collection')
      const blob = createSummaryExportBlob(collection.patches, format, {
        context: 'collection',
        sourceName: sourceName || null,
      })
      triggerDownload(blob, `${filenameBase}-summaries.${format}`)
    } catch (err) {
      console.error(err)
      setCollectionError(err instanceof Error ? err.message : 'Failed to export patch summaries')
    }
  }

  const handleExportBuildSummaries = (format: 'csv' | 'json') => {
    if (patches.length === 0) {
      setPatchError('Add at least one patch to export summaries')
      return
    }

    try {
      const sourceName = outputKind === 'preset' ? buildPresetFields.name : buildPresetFields.dataId
      const filenameBase = toFilename(sourceName, 'minilogue-xd-workspace')
      const blob = createSummaryExportBlob(patches, format, {
        context: 'build',
        sourceName: sourceName || null,
      })
      triggerDownload(blob, `${filenameBase}-summaries.${format}`)
    } catch (err) {
      console.error(err)
      setPatchError(err instanceof Error ? err.message : 'Failed to export patch summaries')
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
        userData: workspaceUserData ?? undefined,
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

  const collectionEditorPatches = useMemo<EditorPatch[]>(
    () => (collection ? collection.patches.map((patch) => ({ ...patch })) : []),
    [collection],
  )
  const secondaryEditorPatches = useMemo<EditorPatch[]>(
    () => (secondaryCollection ? secondaryCollection.patches.map((patch) => ({ ...patch })) : []),
    [secondaryCollection],
  )

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

      <main className="layout">
        <aside className="layout__sidebar">
          <section className="panel panel--sidebar">
            <h2 className="panel__heading">Primary library</h2>
            <p className="muted small">Import or reset the main library you want to curate.</p>
            <label className="dropzone dropzone--compact">
              <span className="dropzone__title">Drop a .mnlgxdlib or .mnlgxdpreset file</span>
              <span className="dropzone__subtitle">or click to browse</span>
              <input type="file" accept=".mnlgxdlib,.mnlgxdpreset,.zip" onChange={handleCollectionUpload} />
            </label>
            <div className="sidebar-actions">
              <button type="button" className="btn btn--ghost" onClick={handleStartBlankLibrary}>
                Start blank library
              </button>
            </div>
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
          </section>

          <section className="panel panel--sidebar">
            <h2 className="panel__heading">Reference library</h2>
            <p className="muted small">Load a second archive to browse and copy patches from.</p>
            <label className="dropzone dropzone--compact">
              <span className="dropzone__title">Drop a .mnlgxdlib or .mnlgxdpreset file</span>
              <span className="dropzone__subtitle">or click to browse</span>
              <input type="file" accept=".mnlgxdlib,.mnlgxdpreset,.zip" onChange={handleSecondaryCollectionUpload} />
            </label>
            <div className="sidebar-actions">
              <button type="button" className="btn btn--ghost" onClick={handleStartSecondaryBlankLibrary}>
                Start blank reference
              </button>
              {secondaryCollection && (
                <button type="button" className="btn btn--ghost btn--danger" onClick={handleClearSecondaryLibrary}>
                  Clear reference
                </button>
              )}
            </div>
            {secondaryError && <p className="error">{secondaryError}</p>}
          </section>
        </aside>

        <div className="layout__content">
          {undoState && (
            <div className="undo-banner">
              <span className="undo-banner__message">{undoState.message}</span>
              <div className="undo-banner__actions">
                <button type="button" className="btn btn--ghost" onClick={handleUndoRemoval}>
                  Undo
                </button>
                <button type="button" className="btn btn--ghost" onClick={handleDismissUndo}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="panels-grid">
            <section className="panel-card panel-card--wide">
              <header className="panel-card__header">
                <div>
                  <h2>MIDI Librarian</h2>
                  <p className="muted small">Connect directly to a minilogue xd to dump or push programs via Web MIDI.</p>
                </div>
              </header>
              <div className="panel-card__body panel-card__body--scroll">
                <MidiLibrarianPanel
                  workspacePatches={patches}
                  collection={collection}
                  onPatchFetched={handleMidiPatchFetched}
                  onCollectionDumped={handleMidiCollectionDumped}
                />
              </div>
            </section>

            <section className="panel-card">
              <header className="panel-card__header">
                <div>
                  <h2>Primary library</h2>
                  <p className="muted small">
                    {collection ? `${collection.patches.length} patches loaded` : 'Import a library using the controls on the left.'}
                  </p>
                </div>
              </header>
              <div className="panel-card__body panel-card__body--scroll">
                {collection ? (
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

                    <UserDataPanel
                      title="User oscillators & effects"
                      description="These user units will be preserved when exporting this archive."
                      data={collection.metadata.userData}
                      formatBytes={formatBytes}
                      onDownload={handleDownloadUserData}
                    />

                    <div className="panel-toolbar">
                      <button type="button" onClick={() => handleCollectionDownload('library')} className="panel-toolbar__button">
                        Download .mnlgxdlib
                      </button>
                      <button type="button" onClick={() => handleCollectionDownload('preset')} className="panel-toolbar__button">
                        Download .mnlgxdpreset
                      </button>
                      <button type="button" onClick={handleDownloadAllPatches} className="panel-toolbar__button">
                        Download all patches (.zip)
                      </button>
                      {collection.patches.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleExportCollectionSummaries('csv')}
                            className="panel-toolbar__button"
                          >
                            Export summaries (.csv)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportCollectionSummaries('json')}
                            className="panel-toolbar__button"
                          >
                            Export summaries (.json)
                          </button>
                        </>
                      )}
                    </div>

                    <MetadataEditor
                      patches={collectionEditorPatches}
                      onMove={(index, offset) => moveLibraryPatchWithinLibrary('primary', index, offset)}
                      onReorder={(source, target) => reorderLibraryPatch('primary', source, target)}
                      onRemove={(index) => removeLibraryPatches('primary', [index])}
                      filter={collectionFilter}
                      onFilterChange={setCollectionFilter}
                      formatBytes={formatBytes}
                      renderActions={(patch, index) => (
                        <div className="metadata-actions">
                          <div className="metadata-actions__main">
                            <button
                              type="button"
                              className="btn btn--ghost metadata-action__details"
                              onClick={() => handleShowDetails(patch, 'collection')}
                            >
                              <IconInfo />
                              <span>Details</span>
                            </button>
                            {renderPreviewControl(patch)}
                          </div>
                          <ActionMenu
                            items={[
                              {
                                label: 'Download patch (.mnlgxdprog)',
                                onSelect: () => handleDownloadPatch(patch),
                              },
                              {
                                label: 'Copy to workspace',
                                onSelect: () => moveLibraryPatchToWorkspace('primary', index),
                              },
                            ]}
                          />
                        </div>
                      )}
                    />

                    <DuplicateManager
                      patches={collectionEditorPatches}
                      onRemoveMany={(indexes) => removeLibraryPatches('primary', indexes)}
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
                ) : (
                  <p className="muted">Import a library to see its contents here.</p>
                )}
              </div>
            </section>

            {secondaryCollection && (
              <section className="panel-card panel-card--reference">
                <header className="panel-card__header">
                  <div>
                    <h2>Reference library</h2>
                    <p className="muted small">
                      {`${secondaryCollection.patches.length} patches loaded`}
                    </p>
                  </div>
                </header>
                <div className="panel-card__body panel-card__body--scroll">
                  <div className="stack">
                    {secondaryWarnings.length > 0 && (
                      <ValidationCallout title="Archive warnings" items={secondaryWarnings} />
                    )}

                    <div className="summary">
                      <div>
                        <span className="summary__label">Source file</span>
                        <span>{secondaryCollection.metadata.sourceName ?? '—'}</span>
                      </div>
                      <div>
                        <span className="summary__label">Patches detected</span>
                        <span>{secondaryCollection.patches.length}</span>
                      </div>
                      {secondaryStatusSummary.length > 0 && (
                        <div>
                          <span className="summary__label">Factory / init</span>
                          <span>{secondaryStatusSummary.join(' · ')}</span>
                        </div>
                      )}
                    </div>

                    <MetadataEditor
                      patches={secondaryEditorPatches}
                      onMove={(index, offset) => moveLibraryPatchWithinLibrary('secondary', index, offset)}
                      onReorder={(source, target) => reorderLibraryPatch('secondary', source, target)}
                      onRemove={(index) => removeLibraryPatches('secondary', [index])}
                      filter={secondaryFilter}
                      onFilterChange={setSecondaryFilter}
                      formatBytes={formatBytes}
                      renderActions={(patch, index) => (
                        <div className="metadata-actions">
                          <div className="metadata-actions__main">
                            <button
                              type="button"
                              className="btn btn--ghost metadata-action__details"
                              onClick={() => handleShowDetails(patch, 'secondary')}
                            >
                              <IconInfo />
                              <span>Details</span>
                            </button>
                            {renderPreviewControl(patch)}
                          </div>
                          <ActionMenu
                            items={[
                              {
                                label: 'Download patch (.mnlgxdprog)',
                                onSelect: () => handleDownloadPatch(patch),
                              },
                              {
                                label: 'Copy to workspace',
                                onSelect: () => moveLibraryPatchToWorkspace('secondary', index),
                              },
                            ]}
                          />
                        </div>
                      )}
                    />

                    <DuplicateManager
                      patches={secondaryEditorPatches}
                      onRemoveMany={(indexes) => removeLibraryPatches('secondary', indexes)}
                    />
                  </div>
                </div>
              </section>
            )}

            <section className="panel-card panel-card--workspace">
              <header className="panel-card__header">
                <div>
                  <h2>Workspace</h2>
                  <p className="muted small">
                    {patches.length ? `${patches.length} patches queued for export` : 'Add .mnlgxdprog files or copy from a library.'}
                  </p>
                </div>
                <label className="dropzone dropzone--inline">
                  <span className="muted small">Add .mnlgxdprog files</span>
                  <input type="file" accept=".mnlgxdprog" multiple onChange={handlePatchUpload} />
                </label>
              </header>
              <div className="panel-card__body panel-card__body--scroll">
                {patchError && <p className="error multiline">{patchError}</p>}
                {previewNotice && <p className="error multiline">{previewNotice}</p>}

                {patches.length > 0 ? (
                  <div className="stack">
                    <MetadataEditor
                      patches={patches}
                      onMove={movePatch}
                      onReorder={reorderWorkspacePatch}
                      onRemove={removePatch}
                      onRename={(index, name) =>
                        setPatches((prev) => prev.map((patch, idx) => (idx === index ? updatePatchName(patch, name) : patch)))
                      }
                      onComment={(index, comment) =>
                        setPatches((prev) => prev.map((patch, idx) => (idx === index ? updatePatchComment(patch, comment) : patch)))
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
                      renderActions={(patch, index) => {
                        const menuItems: ActionMenuItem[] = []
                        if (collection) {
                          menuItems.push({
                            label: `Copy to ${collection.metadata.sourceName ?? 'primary library'}`,
                            onSelect: () => moveWorkspacePatchToLibrary('primary', index),
                          })
                        }
                        if (secondaryCollection) {
                          menuItems.push({
                            label: `Copy to ${secondaryCollection.metadata.sourceName ?? 'reference library'}`,
                            onSelect: () => moveWorkspacePatchToLibrary('secondary', index),
                          })
                        }
                        return (
                          <div className="metadata-actions">
                            <div className="metadata-actions__main">
                              <button
                                type="button"
                                className="btn btn--ghost metadata-action__details"
                                onClick={() => handleShowDetails(patch, 'build')}
                              >
                                <IconInfo />
                                <span>Details</span>
                              </button>
                              {renderPreviewControl(patch)}
                            </div>
                            <ActionMenu items={menuItems} />
                          </div>
                        )
                      }}
                    />

                    <DuplicateManager patches={patches} onRemoveMany={removePatches} />

                    <ParameterRandomizer
                      patches={patches}
                      targetIndex={randomizerTargetIndex}
                      onTargetChange={setRandomizerTargetIndex}
                      config={randomizerConfig}
                      onRangeChange={handleRandomizerRangeChange}
                      onReset={handleRandomizerReset}
                      onApply={handleRandomizerApply}
                    />

                    <div className="panel-toolbar">
                      <button type="button" className="panel-toolbar__button" onClick={() => handleExportBuildSummaries('csv')}>
                        Export summaries (.csv)
                      </button>
                      <button type="button" className="panel-toolbar__button" onClick={() => handleExportBuildSummaries('json')}>
                        Export summaries (.json)
                      </button>
                    </div>

                    <UserDataPanel
                      title="Workspace user oscillators & effects"
                      description="Any units from imported archives will be included when exporting this build."
                      data={workspaceUserData}
                      formatBytes={formatBytes}
                      onDownload={handleDownloadUserData}
                    />

                    {buildStatusSummary && <div className="muted small">{buildStatusSummary}</div>}

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
                ) : (
                  <p className="muted">Add patches to the workspace to build a custom set.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
      </div>
      {selectedPatch && <PatchDetailsPanel detail={selectedPatch} onClose={handleCloseDetails} />}
    </>
  )
}

export default App

type ParameterRandomizerProps = {
  patches: EditorPatch[]
  targetIndex: number
  onTargetChange: (index: number) => void
  config: RandomizerConfig
  onRangeChange: (key: string, range: RandomizerRange) => void
  onReset: () => void
  onApply: (action: RandomizerAction) => void
}

const ParameterRandomizer = ({
  patches,
  targetIndex,
  onTargetChange,
  config,
  onRangeChange,
  onReset,
  onApply,
}: ParameterRandomizerProps) => {
  const targetPatch = patches[targetIndex] ?? patches[0]

  const clamp = (value: number) => {
    if (!Number.isFinite(value)) return 0
    if (value < 0) return 0
    if (value > 100) return 100
    return Math.round(value)
  }

  return (
    <div className="card randomizer-card">
      <div className="randomizer-header">
        <h3>Parameter randomizer</h3>
        <p className="muted small">
          Generate fresh variations by randomising selected parameters within controlled ranges.
        </p>
      </div>

      <div className="randomizer-target">
        <label className="randomizer-target__select">
          <span className="randomizer-label">Target patch</span>
          <select
            value={String(Math.min(targetIndex, Math.max(0, patches.length - 1)))}
            onChange={(event) => onTargetChange(Number(event.target.value))}
          >
            {patches.map((patch, idx) => (
              <option key={`${idx}-${patch.name}`} value={idx}>
                {idx + 1}. {patch.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset ranges
        </button>
      </div>

      <div className="randomizer-groups">
        {RANDOMIZER_GROUPS.map((group) => (
          <div key={group.id} className="randomizer-group">
            <h4>{group.label}</h4>
            <div className="randomizer-fields">
              {group.fields.map((field) => {
                const range = config[field.key] ?? { enabled: true, min: 0, max: 100 }
                const preview = targetPatch ? getRandomizerFieldValue(targetPatch, field.key) : null
                const handleToggle = (enabled: boolean) => {
                  onRangeChange(field.key, { ...range, enabled })
                }
                const handleMinChange = (value: number) => {
                  const next = clamp(value)
                  const updated: RandomizerRange = { ...range, min: next }
                  if (next > range.max) {
                    updated.max = next
                  }
                  onRangeChange(field.key, updated)
                }
                const handleMaxChange = (value: number) => {
                  const next = clamp(value)
                  const updated: RandomizerRange = { ...range, max: next }
                  if (next < range.min) {
                    updated.min = next
                  }
                  onRangeChange(field.key, updated)
                }
                return (
                  <div key={field.key} className="randomizer-field">
                    <div className="randomizer-field__header">
                      <label className="randomizer-toggle">
                        <input
                          type="checkbox"
                          checked={range.enabled}
                          onChange={(event) => handleToggle(event.target.checked)}
                        />
                        <span>{field.label}</span>
                      </label>
                      {preview && (
                        <span className="muted small">
                          Current: {preview.percent}% ({preview.raw})
                        </span>
                      )}
                    </div>
                    <div className="randomizer-field__body">
                      <div className="randomizer-field__control">
                        <span className="muted small">Min</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={range.min}
                          onChange={(event) => handleMinChange(Number(event.target.value))}
                          disabled={!range.enabled}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={range.min}
                          onChange={(event) => handleMinChange(Number(event.target.value))}
                          disabled={!range.enabled}
                        />
                      </div>
                      <div className="randomizer-field__control">
                        <span className="muted small">Max</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={range.max}
                          onChange={(event) => handleMaxChange(Number(event.target.value))}
                          disabled={!range.enabled}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={range.max}
                          onChange={(event) => handleMaxChange(Number(event.target.value))}
                          disabled={!range.enabled}
                        />
                      </div>
                      <span className="muted small randomizer-field__summary">
                        Range: {range.min}% – {range.max}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="randomizer-actions">
        <button type="button" className="btn" onClick={() => onApply('selected')}>
          Randomize selected patch
        </button>
        <button type="button" className="btn" onClick={() => onApply('duplicate')}>
          Duplicate &amp; randomize
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => onApply('all')}>
          Randomize all patches
        </button>
      </div>
    </div>
  )
}

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
  onReorder?: (sourceIndex: number, targetIndex: number) => void
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
  onReorder,
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
  const [dragSource, setDragSource] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragOverAfter, setDragOverAfter] = useState(false)

  const isEditable = !readOnly && Boolean(onRename || onComment)
  const hasInteractiveControls = !readOnly && Boolean(onMove || onRemove || onReorder)
  const hasCustomActions = Boolean(renderActions)
  const showControls = hasInteractiveControls || hasCustomActions
  const columnTemplate = showControls ? '48px minmax(280px, 1fr) minmax(120px, auto)' : '48px minmax(280px, 1fr)'
  const filterValue = filter ?? ''
  const normalizedFilter = filterValue.trim().toLowerCase()
  const isFiltered = normalizedFilter.length > 0
  const disableOrdering = isFiltered
  const canReorder = Boolean(onReorder) && hasInteractiveControls && !disableOrdering

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

  const handleDragStart = (event: DragEvent<HTMLLIElement>, originalIndex: number) => {
    if (!canReorder) return
    setDragSource(originalIndex)
    setDragOverIndex(originalIndex)
    setDragOverAfter(false)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(originalIndex))
    }
  }

  const handleDragOver = (event: DragEvent<HTMLLIElement>, originalIndex: number) => {
    if (!canReorder) return
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const midpoint = bounds.top + bounds.height / 2
    const after = event.clientY > midpoint
    if (dragOverIndex !== originalIndex || dragOverAfter !== after) {
      setDragOverIndex(originalIndex)
      setDragOverAfter(after)
    }
  }

  const resetDragState = () => {
    setDragSource(null)
    setDragOverIndex(null)
    setDragOverAfter(false)
  }

  const handleDragLeave = () => {
    if (!canReorder) return
    setDragOverIndex(null)
    setDragOverAfter(false)
  }

  const handleDrop = (event: DragEvent<HTMLLIElement>, originalIndex: number) => {
    if (!canReorder || !onReorder) {
      resetDragState()
      return
    }
    event.preventDefault()
    const data = event.dataTransfer?.getData('text/plain')
    const source = dragSource ?? (data ? Number.parseInt(data, 10) : NaN)
    if (!Number.isFinite(source)) {
      resetDragState()
      return
    }
    if (source === originalIndex && !dragOverAfter) {
      resetDragState()
      return
    }
    let insertIndex = originalIndex + (dragOverAfter ? 1 : 0)
    if (insertIndex > patches.length) insertIndex = patches.length
    if (source < insertIndex) insertIndex -= 1
    insertIndex = Math.max(0, Math.min(insertIndex, patches.length - 1))
    onReorder(source, insertIndex)
    resetDragState()
  }

  const handleDragEnd = () => {
    if (!canReorder) return
    resetDragState()
  }

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
          <span>Patch</span>
          {showControls && <span>Actions</span>}
        </div>
        <ul>
          {filteredItems.map(({ patch, index }) => {
            const isDragging = canReorder && dragSource === index
            const isDragTarget = canReorder && dragOverIndex === index
            const rowClassName = ['metadata-row']
              .concat(isDragging ? ['is-dragging'] : [])
              .concat(
                isDragTarget
                  ? ['is-drag-over', dragOverAfter ? 'is-drag-over--after' : 'is-drag-over--before']
                  : [],
              )
              .join(' ')
            return (
              <li
                key={`${index}-${patch.name}`}
                className={rowClassName}
                style={{ gridTemplateColumns: columnTemplate }}
                draggable={canReorder}
                onDragStart={(event) => handleDragStart(event, index)}
                onDragOver={(event) => handleDragOver(event, index)}
                onDrop={(event) => handleDrop(event, index)}
                onDragEnd={handleDragEnd}
                onDragLeave={handleDragLeave}
              >
              <span className="metadata-index">{index + 1}</span>
              <div className="metadata-main">
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
                <div className="metadata-subrow">
                  {isEditable && onComment ? (
                    <input
                      type="text"
                      value={patch.comment ?? ''}
                      onChange={(event) => onComment(index, event.target.value)}
                      className="metadata-input metadata-input--comment"
                      placeholder="Add comment"
                    />
                  ) : (
                    <span className="metadata-comment-text muted small">{patch.comment ?? '—'}</span>
                  )}
                  {!readOnly && patch.sourceName && (
                    <span className="metadata-source muted small">
                      {patch.sourceName}
                      {patch.progBin && formatBytes ? ` • ${formatBytes(patch.progBin.length)}` : ''}
                    </span>
                  )}
                </div>
              </div>
              {showControls && (
                <div className="metadata-controls">
                  {hasInteractiveControls && (
                    <div className="metadata-controls__group">
                      <IconButton
                        label="Move up"
                        onClick={() => onMove && onMove(index, -1)}
                        disabled={!onMove || index === 0 || disableOrdering}
                      >
                        <IconChevronUp />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        onClick={() => onMove && onMove(index, 1)}
                        disabled={!onMove || index === patches.length - 1 || disableOrdering}
                      >
                        <IconChevronDown />
                      </IconButton>
                      <IconButton
                        label="Remove patch"
                        onClick={() => onRemove && onRemove(index)}
                        disabled={!onRemove}
                        className="metadata-control--danger"
                      >
                        <IconTrash />
                      </IconButton>
                    </div>
                  )}
                  {renderActions && <div className="metadata-controls__group">{renderActions(patch, index)}</div>}
                </div>
              )}
            </li>
          )
          })}
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

type DuplicateStrategy = 'name' | 'hash'

type DuplicateGroup = {
  key: string
  label: string
  description?: string
  indices: number[]
}

const computeDuplicateGroups = (patches: EditorPatch[], mode: DuplicateStrategy): DuplicateGroup[] => {
  const map = new Map<string, number[]>()
  patches.forEach((patch, index) => {
    if (mode === 'name') {
      const key = patch.name.trim().toLowerCase()
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(index)
    } else {
      const hash = patch.hash?.toLowerCase()
      if (!hash) return
      if (!map.has(hash)) map.set(hash, [])
      map.get(hash)!.push(index)
    }
  })

  return Array.from(map.entries())
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, indexes]) => {
      const sorted = [...indexes].sort((a, b) => a - b)
      const primary = patches[sorted[0]]
      const label = mode === 'name' ? `Name: ${primary.name || '(untitled)'}` : `Parameters like "${primary.name || '(untitled)'}"`
      const description = mode === 'hash' ? (primary.hash ? `Hash ${primary.hash}` : undefined) : `Appears ${sorted.length} times`
      return { key, label, description, indices: sorted }
    })
    .sort((a, b) => a.indices[0] - b.indices[0])
}

type DuplicateManagerProps = {
  patches: EditorPatch[]
  onRemoveMany: (indexes: number[]) => void
}

const DuplicateManager = ({ patches, onRemoveMany }: DuplicateManagerProps) => {
  const [mode, setMode] = useState<DuplicateStrategy>('name')
  const groups = useMemo(() => computeDuplicateGroups(patches, mode), [patches, mode])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    const defaults = new Set<number>()
    groups.forEach((group) => {
      group.indices.slice(1).forEach((idx) => defaults.add(idx))
    })
    setSelected(defaults)
  }, [groups])

  if (!patches.length) {
    return null
  }

  const toggleIndex = (index: number, locked: boolean) => {
    if (locked) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleRemoveSelected = () => {
    if (!selected.size) return
    onRemoveMany(Array.from(selected))
  }

  const handleSelectAll = () => {
    const all = new Set<number>()
    groups.forEach((group) => {
      group.indices.slice(1).forEach((idx) => all.add(idx))
    })
    setSelected(all)
  }

  const handleClearSelection = () => setSelected(new Set())

  const removableCount = groups.reduce((sum, group) => sum + (group.indices.length - 1), 0)
  const summaryLabel = groups.length
    ? mode === 'name'
      ? `${groups.length} duplicate name group${groups.length === 1 ? '' : 's'} · ${removableCount} removable`
      : `${groups.length} parameter match group${groups.length === 1 ? '' : 's'} · ${removableCount} removable`
    : mode === 'name'
      ? 'No duplicate names detected'
      : 'No parameter duplicates detected'

  return (
    <div className="duplicates">
      <div className="duplicates__header">
        <div>
          <span className="details-label">Duplicates</span>
          <p className="muted small">{summaryLabel}</p>
        </div>
        <div className="duplicates__modes">
          <button
            type="button"
            className={`btn btn--ghost${mode === 'name' ? ' is-active' : ''}`}
            onClick={() => setMode('name')}
          >
            By name
          </button>
          <button
            type="button"
            className={`btn btn--ghost${mode === 'hash' ? ' is-active' : ''}`}
            onClick={() => setMode('hash')}
          >
            By parameters
          </button>
        </div>
      </div>

      <div className="duplicates__actions">
        <div className="duplicates__left">
          <button type="button" className="btn btn--ghost" onClick={handleSelectAll} disabled={!removableCount}>
            Select all duplicates
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleClearSelection} disabled={!selected.size}>
            Clear selection
          </button>
        </div>
        <div className="duplicates__right">
          <span className="muted small">{selected.size} selected</span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleRemoveSelected}
            disabled={!selected.size}
          >
            Remove selected
          </button>
        </div>
      </div>

      <div className="duplicates__groups">
        {groups.length > 0 ? (
          groups.map((group) => (
            <div key={group.key} className="duplicates__group">
              <div className="duplicates__group-header">
                <div>
                  <h4>{group.label}</h4>
                  {group.description && <p className="muted small">{group.description}</p>}
                </div>
                <span className="muted small">{group.indices.length} patches</span>
              </div>
              <ul className="duplicates__list">
                {group.indices.map((idx, position) => {
                  const patch = patches[idx]
                  const locked = position === 0
                  const checked = locked ? false : selected.has(idx)
                  return (
                    <li key={idx} className="duplicates__item">
                      <label className="duplicates__checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleIndex(idx, locked)}
                        />
                        <span>
                          #{idx + 1} · {patch.name || 'Untitled'}
                          {patch.sourceName ? ` (${patch.sourceName})` : ''}
                        </span>
                      </label>
                      {locked && <span className="muted small">Keeping first</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        ) : (
          <div className="duplicates__empty">
            <p className="muted">No duplicates detected.</p>
            <p className="muted small">
              Switch between name and parameter matching to double-check, then add or import more patches to see
              groups appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

type SummaryRow = PatchSummaryCategory['rows'][number]

type ComparisonDeltaKind = 'neutral' | 'positive' | 'negative' | 'added' | 'removed' | 'changed'

type ComparisonDisplayRow = {
  label: string
  current: string | null
  other: string | null
  delta: string
  deltaKind: ComparisonDeltaKind
  order: number
}

type ComparisonDisplayCategory = {
  label: string
  order: number
  rows: ComparisonDisplayRow[]
}

const buildComparisonCategories = (
  base: PatchSummaryCategory[],
  target: PatchSummaryCategory[],
): Array<{ label: string; rows: Array<Omit<ComparisonDisplayRow, 'order'>> }> => {
  const categoryOrder = new Map<string, number>()
  base.forEach((category, index) => {
    categoryOrder.set(category.label, index)
  })
  let nextOrder = base.length
  target.forEach((category) => {
    if (!categoryOrder.has(category.label)) {
      categoryOrder.set(category.label, nextOrder)
      nextOrder += 1
    }
  })

  const baseMap = new Map<
    string,
    { category: string; row: SummaryRow; categoryIndex: number; rowIndex: number }
  >()
  base.forEach((category, categoryIndex) => {
    category.rows.forEach((row, rowIndex) => {
      baseMap.set(`${category.label}__${row.label}`, { category: category.label, row, categoryIndex, rowIndex })
    })
  })

  const targetMap = new Map<
    string,
    { category: string; row: SummaryRow; categoryIndex: number; rowIndex: number }
  >()
  target.forEach((category, categoryIndex) => {
    const mappedCategoryIndex = categoryOrder.get(category.label) ?? categoryIndex
    category.rows.forEach((row, rowIndex) => {
      targetMap.set(`${category.label}__${row.label}`, {
        category: category.label,
        row,
        categoryIndex: mappedCategoryIndex,
        rowIndex,
      })
    })
  })

  const results = new Map<string, ComparisonDisplayCategory>()
  const keys = new Set([...baseMap.keys(), ...targetMap.keys()])

  keys.forEach((key) => {
    const baseEntry = baseMap.get(key)
    const targetEntry = targetMap.get(key)
    const categoryLabel = baseEntry?.category ?? targetEntry?.category
    if (!categoryLabel) return
    const categoryIndex =
      categoryOrder.get(categoryLabel) ?? baseEntry?.categoryIndex ?? targetEntry?.categoryIndex ?? 0
    const bucket =
      results.get(categoryLabel) ?? ({ label: categoryLabel, order: categoryIndex, rows: [] } as ComparisonDisplayCategory)

    const rowLabel = baseEntry?.row.label ?? targetEntry?.row.label ?? key
    const currentValue = baseEntry?.row.value ?? null
    const otherValue = targetEntry?.row.value ?? null

    let delta = '—'
    let deltaKind: ComparisonDeltaKind = 'neutral'

    if (baseEntry && targetEntry) {
      const diffSourceA = baseEntry.row.normalizedValue
      const diffSourceB = targetEntry.row.normalizedValue
      if (diffSourceA != null && diffSourceB != null) {
        const diff = diffSourceA - diffSourceB
        if (Math.abs(diff) >= 0.005) {
          const percent = Math.round(diff * 100)
          delta = `${percent > 0 ? '+' : ''}${percent}%`
          deltaKind = percent > 0 ? 'positive' : 'negative'
        }
      }
      if (delta === '—' && baseEntry.row.value !== targetEntry.row.value) {
        delta = 'Changed'
        deltaKind = 'changed'
      }
    } else if (baseEntry && !targetEntry) {
      delta = 'Only in current'
      deltaKind = 'removed'
    } else if (!baseEntry && targetEntry) {
      delta = 'Only in comparison'
      deltaKind = 'added'
    }

    const order = baseEntry?.rowIndex ?? targetEntry?.rowIndex ?? bucket.rows.length
    bucket.rows.push({ label: rowLabel, current: currentValue, other: otherValue, delta, deltaKind, order })
    results.set(categoryLabel, bucket)
  })

  return Array.from(results.values())
    .map((category) => {
      const rows = category.rows
        .sort((a, b) => a.order - b.order)
        .map((row) => ({
          label: row.label,
          current: row.current,
          other: row.other,
          delta: row.delta,
          deltaKind: row.deltaKind,
        }))
      return { label: category.label, rows, order: category.order }
    })
    .sort((a, b) => a.order - b.order)
    .map((category) => ({ label: category.label, rows: category.rows }))
}

type PatchDetailsPanelProps = {
  detail: { patch: EditorPatch; context: 'collection' | 'secondary' | 'build'; peers: EditorPatch[] }
  onClose: () => void
}

const PatchDetailsPanel = ({ detail, onClose }: PatchDetailsPanelProps) => {
  const { patch, context, peers } = detail
  const [compareId, setCompareId] = useState('')
  const progInfoEntries = useMemo(() => parseProgInfoEntries(patch.progInfoXml), [patch.progInfoXml])
  const summaryCategories = useMemo(() => getPatchSummary(patch), [patch])

  useEffect(() => {
    setCompareId('')
  }, [patch.hash, patch.index])

  const visualiserGroups = useMemo(
    () =>
      summaryCategories
        .map((category) => ({
          label: category.label,
          rows: category.rows.filter((row) => typeof row.normalizedValue === 'number'),
        }))
        .filter((group) => group.rows.length > 0),
    [summaryCategories],
  )

  const comparisonPeers = useMemo(
    () =>
      peers
        .filter((peer) => getPatchKey(peer) !== getPatchKey(patch))
        .slice()
        .sort((a, b) => a.index - b.index),
    [peers, patch],
  )

  const comparePatch = useMemo(
    () => comparisonPeers.find((peer) => getPatchKey(peer) === compareId) ?? null,
    [comparisonPeers, compareId],
  )

  const compareSummary = useMemo(
    () => (comparePatch ? getPatchSummary(comparePatch) : []),
    [comparePatch],
  )

  const comparisonCategories = useMemo(
    () => (comparePatch ? buildComparisonCategories(summaryCategories, compareSummary) : []),
    [comparePatch, summaryCategories, compareSummary],
  )

  return (
    <div className="details-overlay" role="dialog" aria-modal="true">
      <div className="details-panel">
        <div className="details-header">
          <div>
            <h3>{patch.name}</h3>
            <p className="muted small">
              {context === 'collection'
                ? 'Primary library'
                : context === 'secondary'
                  ? 'Reference library'
                  : 'Build workspace'}
              {' '}
              · Index {patch.index + 1}
            </p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="details-visual">
          <PatchVisualPanel patch={patch} />
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

        {visualiserGroups.length > 0 && (
          <div className="details-section">
            <span className="details-label">Parameter visualiser</span>
            <div className="parameter-visualiser">
              {visualiserGroups.map((group) => (
                <div key={group.label} className="parameter-visualiser__group">
                  <h4>{group.label}</h4>
                  <div className="parameter-visualiser__rows">
                    {group.rows.map((row) => {
                      const width = Math.max(0, Math.min(100, Math.round((row.normalizedValue ?? 0) * 100)))
                      return (
                        <div key={row.label} className="param-bar">
                          <div className="param-bar__header">
                            <span>{row.label}</span>
                            <span className="param-bar__value">{row.value}</span>
                          </div>
                          <div className="param-bar__track">
                            <div className="param-bar__fill" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {comparisonPeers.length > 0 && (
          <div className="details-section">
            <span className="details-label">Compare with</span>
            <div className="comparison-controls">
              <select
                value={compareId}
                onChange={(event) => setCompareId(event.target.value)}
                className="comparison-select"
              >
                <option value="">Select patch…</option>
                {comparisonPeers.map((peer) => (
                  <option key={getPatchKey(peer)} value={getPatchKey(peer)}>
                    {peer.index + 1}. {peer.name}
                  </option>
                ))}
              </select>
              {compareId && (
                <button type="button" className="btn btn--ghost" onClick={() => setCompareId('')}>
                  Clear
                </button>
              )}
            </div>

            {comparePatch ? (
              comparisonCategories.length > 0 ? (
                <div className="comparison-table-wrapper">
                  {comparisonCategories.map((category) => (
                    <div key={category.label} className="comparison-category">
                      <h4>{category.label}</h4>
                      <div className="comparison-table">
                        <div className="comparison-table__header">
                          <span>Parameter</span>
                          <span>{patch.name}</span>
                          <span>{comparePatch.name}</span>
                          <span>Δ</span>
                        </div>
                        {category.rows.map((row) => (
                          <div key={row.label} className="comparison-table__row">
                            <span>{row.label}</span>
                            <span>{row.current ?? '—'}</span>
                            <span>{row.other ?? '—'}</span>
                            <span className={`comparison-delta comparison-delta--${row.deltaKind}`}>
                              {row.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No overlapping parameters to compare.</p>
              )
            ) : (
              <p className="muted small">Choose another patch to see parameter differences.</p>
            )}
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
