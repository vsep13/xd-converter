#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import process from 'node:process'

import {
  buildXdCollectionArchive,
  parseXdCollection,
  parseXdPatch,
  type BuildCollectionOptions,
  type PresetInformationFields,
  type RawXdPatch,
  type XdUserData,
} from '../src/lib/minilogueXd.ts'
import { createSummaryExportBlob, toFilename } from '../src/utils/summaryExport.ts'

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

const createEmptyUserData = (): XdUserData => ({
  oscillators: [],
  modEffects: [],
  delayEffects: [],
  reverbEffects: [],
})

const mergeUserDataSets = (current: XdUserData | null, next?: XdUserData | null): XdUserData | null => {
  if (!next) return current

  const base = current
    ? {
        oscillators: [...current.oscillators],
        modEffects: [...current.modEffects],
        delayEffects: [...current.delayEffects],
        reverbEffects: [...current.reverbEffects],
      }
    : createEmptyUserData()

  const mergeCategory = (existing: typeof base.oscillators, incoming: typeof base.oscillators) => {
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

type ParsedArgs = {
  positional: string[]
  flags: Map<string, string | string[] | boolean>
}

const pushFlag = (flags: Map<string, string | string[] | boolean>, key: string, value: string | boolean) => {
  const existing = flags.get(key)
  if (existing === undefined) {
    flags.set(key, value)
    return
  }
  if (Array.isArray(existing)) {
    existing.push(value as string)
    return
  }
  flags.set(key, [existing as string, value as string])
}

const parseArguments = (input: string[]): ParsedArgs => {
  const positional: string[] = []
  const flags = new Map<string, string | string[] | boolean>()
  let index = 0

  while (index < input.length) {
    const token = input[index]
    if (!token.startsWith('-') || token === '-') {
      positional.push(token)
      index += 1
      continue
    }

    if (token === '--') {
      positional.push(...input.slice(index + 1))
      break
    }

    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=')
      if (eqIndex !== -1) {
        const key = token.slice(2, eqIndex)
        const value = token.slice(eqIndex + 1)
        pushFlag(flags, key, value)
        index += 1
        continue
      }

      const key = token.slice(2)
      const next = input[index + 1]
      if (next == null || next.startsWith('-')) {
        pushFlag(flags, key, true)
        index += 1
      } else {
        pushFlag(flags, key, next)
        index += 2
      }
      continue
    }

    const trimmed = token.slice(1)
    if (trimmed.length > 1) {
      trimmed.split('').forEach((flag) => pushFlag(flags, flag, true))
      index += 1
      continue
    }

    const key = trimmed
    const next = input[index + 1]
    if (next == null || next.startsWith('-')) {
      pushFlag(flags, key, true)
      index += 1
    } else {
      pushFlag(flags, key, next)
      index += 2
    }
  }

  return { positional, flags }
}

const getFlag = (flags: Map<string, string | string[] | boolean>, key: string): string | boolean | undefined => {
  const value = flags.get(key)
  if (Array.isArray(value)) return value[value.length - 1]
  return value
}

type LoadedPatchSet = {
  patches: RawXdPatch[]
  sourceName: string | null
  defaultContext: 'collection' | 'build' | 'patch'
  userData: XdUserData | null
}

const stripExtension = (value: string) => value.replace(/\.[^.]+$/, '')

const loadPatchesFromFile = async (inputPath: string): Promise<LoadedPatchSet> => {
  const absolute = resolve(process.cwd(), inputPath)
  const file = await readFile(absolute)
  const ext = extname(inputPath).toLowerCase()

  if (ext === '.mnlgxdlib' || ext === '.mnlgxdpreset') {
    const { patches, metadata } = parseXdCollection(toArrayBuffer(file), basename(inputPath))
    const sourceName =
      metadata.presetFields?.name ?? metadata.sourceName ?? stripExtension(basename(inputPath))
    return { patches, sourceName, defaultContext: 'collection', userData: metadata.userData ?? null }
  }

  if (ext === '.mnlgxdprog') {
    const patch = parseXdPatch(toArrayBuffer(file))
    return {
      patches: [patch],
      sourceName: patch.name ?? stripExtension(basename(inputPath)),
      defaultContext: 'patch',
      userData: null,
    }
  }

  throw new Error(`Unsupported input file: ${inputPath}`)
}

const writeBlob = async (blob: Blob, destination: string | undefined) => {
  const buffer = Buffer.from(await blob.arrayBuffer())
  if (!destination || destination === '-') {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      process.stdout.write(buffer, (error) => {
        if (error) rejectPromise(error)
        else resolvePromise()
      })
    })
    if (blob.type.includes('json') && !buffer.toString().endsWith('\n')) {
      process.stdout.write('\n')
    }
    return
  }

  const target = resolve(process.cwd(), destination)
  await writeFile(target, buffer)
  console.error(`Wrote ${buffer.length} bytes to ${target}`)
}

const parseFavorites = (value: string | boolean | undefined): number[] | undefined => {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  if (!cleaned) return undefined
  return cleaned
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is string => part.length > 0)
    .map((part) => {
      const parsed = Number.parseInt(part, 10)
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid favorite slot index: ${part}`)
      }
      return parsed
    })
}

const buildPresetInfo = (flags: Map<string, string | string[] | boolean>): Partial<PresetInformationFields> => {
  const entries: Array<[keyof PresetInformationFields, string | boolean | undefined]> = [
    ['dataId', getFlag(flags, 'data-id')],
    ['name', getFlag(flags, 'name')],
    ['author', getFlag(flags, 'author')],
    ['version', getFlag(flags, 'version')],
    ['numOfProg', getFlag(flags, 'program-count')],
    ['date', getFlag(flags, 'date')],
    ['prefix', getFlag(flags, 'prefix')],
    ['copyright', getFlag(flags, 'copyright')],
  ]

  const result: Partial<PresetInformationFields> = {}
  entries.forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      result[key] = value
    }
  })
  return result
}

const handleSummary = async (args: ParsedArgs) => {
  const [inputPath] = args.positional
  if (!inputPath) {
    throw new Error('summary command requires an input file path')
  }

  const formatValue = getFlag(args.flags, 'format') ?? 'json'
  if (typeof formatValue !== 'string' || (formatValue !== 'json' && formatValue !== 'csv')) {
    throw new Error(`Unsupported export format: ${String(formatValue)}`)
  }

  const loaded = await loadPatchesFromFile(inputPath)
  const sourceOverride = getFlag(args.flags, 'source')
  const contextOverride = getFlag(args.flags, 'context')
  const blob = createSummaryExportBlob(loaded.patches, formatValue, {
    sourceName: typeof sourceOverride === 'string' ? sourceOverride : loaded.sourceName,
    context:
      typeof contextOverride === 'string'
        ? (contextOverride as 'collection' | 'build' | 'patch')
        : loaded.defaultContext,
  })

  const explicitDestination = getFlag(args.flags, 'out')
  const defaultBase = toFilename(
    typeof sourceOverride === 'string' && sourceOverride.trim()
      ? sourceOverride
      : loaded.sourceName ?? stripExtension(basename(inputPath)),
    'minilogue-xd-summary',
  )
  const suggestedName = `${defaultBase}.${formatValue}`
  const destination =
    typeof explicitDestination === 'string' && explicitDestination.trim()
      ? explicitDestination
      : suggestedName

  await writeBlob(blob, destination)
}

const handleBuild = async (args: ParsedArgs) => {
  const inputs = args.positional
  if (!inputs.length) {
    throw new Error('build command requires at least one input file')
  }

  const outFlag = getFlag(args.flags, 'out')
  if (typeof outFlag !== 'string' || !outFlag.trim()) {
    throw new Error('build command requires an --out <file> destination')
  }

  const kindFlag = getFlag(args.flags, 'kind')
  const kind = kindFlag === 'preset' ? 'preset' : 'library'
  const favoriteFlag = getFlag(args.flags, 'favorites')
  const favorites = parseFavorites(favoriteFlag)

  const loadedPatches: RawXdPatch[] = []
  let detectedName: string | null = null
  let aggregatedUserData: XdUserData | null = null

  for (const input of inputs) {
    const loaded = await loadPatchesFromFile(input)
    loadedPatches.push(...loaded.patches)
    if (!detectedName && loaded.sourceName) {
      detectedName = loaded.sourceName
    }
    aggregatedUserData = mergeUserDataSets(aggregatedUserData, loaded.userData)
  }

  if (!loadedPatches.length) {
    throw new Error('No patches could be loaded from the provided inputs')
  }

  const presetInfo = buildPresetInfo(args.flags)
  if (!presetInfo.name && detectedName) {
    presetInfo.name = detectedName
  }

  const options: BuildCollectionOptions = {
    kind,
    favorites,
    presetInfo: Object.keys(presetInfo).length ? presetInfo : undefined,
    userData: aggregatedUserData ?? undefined,
  }

  const archive = buildXdCollectionArchive(loadedPatches, options)
  const target = resolve(process.cwd(), outFlag)
  await writeFile(target, archive)
  console.error(`Built ${loadedPatches.length} patch${loadedPatches.length === 1 ? '' : 'es'} -> ${target}`)
}

const printHelp = () => {
  console.log(`xd-converter automation CLI\n\nUsage:\n  xd-converter summary <input> [--format json|csv] [--out <file>] [--source <name>] [--context <label>]\n  xd-converter build [--kind library|preset] --out <file> [--favorites 0,1,...] [--name <value>] <inputs...>\n\nOptions:\n  --format        Summary export format (json or csv).\n  --out           Destination file path. Use '-' to stream to stdout.\n  --source        Override the detected source name in exports.\n  --context       Override the context tag stored in JSON exports.\n  --kind          Target collection type for build command (library default).\n  --favorites     Comma separated favorite slot indexes for library builds.\n  --name          Override preset name metadata when building a preset pack.\n  --author        Set preset author metadata for preset builds.\n  --version       Set preset version metadata for preset builds.\n  --data-id       Set preset data ID metadata for preset builds.\n  --date          Set preset date metadata for preset builds.\n  --prefix        Set preset prefix metadata for preset builds.\n  --copyright     Set preset copyright metadata for preset builds.\n  --program-count Override preset program count metadata.\n  -h, --help      Show this usage guide.\n`)
}

const main = async () => {
  const [, , ...argv] = process.argv
  if (!argv.length || argv.includes('-h') || argv.includes('--help')) {
    printHelp()
    return
  }

  const [command, ...rest] = argv
  const args = parseArguments(rest)

  try {
    if (command === 'summary') {
      await handleSummary(args)
      return
    }

    if (command === 'build') {
      await handleBuild(args)
      return
    }

    throw new Error(`Unknown command: ${command}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    if (message.startsWith('Unknown command')) {
      printHelp()
    }
    process.exitCode = 1
  }
}

void main()
