import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { APP_VERSION, BUILD_TIMESTAMP } from '../version'
import { factoryHashSet, initHashSet } from './factoryHashes'

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

const PROG_BIN_REGEX = /Prog_(\d{3})\.prog_bin$/
const PROGRAM_NAME_OFFSET = 4
const PROGRAM_NAME_LENGTH = 12
const XD_PATCH_SIZE = 1024


const md5 = (data: Uint8Array): string => {
  const rotateLeft = (lValue: number, shiftBits: number) => (lValue << shiftBits) | (lValue >>> (32 - shiftBits))

  const addUnsigned = (x: number, y: number) => {
    const x4 = x & 0x40000000
    const y4 = y & 0x40000000
    const x8 = x & 0x80000000
    const y8 = y & 0x80000000
    const result = (x & 0x3fffffff) + (y & 0x3fffffff)
    if (x4 & y4) {
      return result ^ 0x80000000 ^ x8 ^ y8
    }
    if (x4 | y4) {
      if (result & 0x40000000) {
        return result ^ 0xc0000000 ^ x8 ^ y8
      }
      return result ^ 0x40000000 ^ x8 ^ y8
    }
    return result ^ x8 ^ y8
  }

  const F = (x: number, y: number, z: number) => (x & y) | (~x & z)
  const G = (x: number, y: number, z: number) => (x & z) | (y & ~z)
  const H = (x: number, y: number, z: number) => x ^ y ^ z
  const I = (x: number, y: number, z: number) => y ^ (x | ~z)

  const convertToWordArray = (input: Uint8Array) => {
    const len = input.length
    const numberOfWords = (((len + 8) >> 6) + 1) * 16
    const wordArray = new Array<number>(numberOfWords).fill(0)

    for (let i = 0; i < len; i += 1) {
      wordArray[i >> 2] |= input[i] << ((i % 4) * 8)
    }

    wordArray[len >> 2] |= 0x80 << ((len % 4) * 8)
    wordArray[numberOfWords - 2] = len * 8
    return wordArray
  }

  const wordArray = convertToWordArray(data)

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  const FF = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, ac: number) => {
    aa = addUnsigned(aa, addUnsigned(addUnsigned(F(bb, cc, dd), x), ac))
    return addUnsigned(rotateLeft(aa, s), bb)
  }
  const GG = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, ac: number) => {
    aa = addUnsigned(aa, addUnsigned(addUnsigned(G(bb, cc, dd), x), ac))
    return addUnsigned(rotateLeft(aa, s), bb)
  }
  const HH = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, ac: number) => {
    aa = addUnsigned(aa, addUnsigned(addUnsigned(H(bb, cc, dd), x), ac))
    return addUnsigned(rotateLeft(aa, s), bb)
  }
  const II = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, ac: number) => {
    aa = addUnsigned(aa, addUnsigned(addUnsigned(I(bb, cc, dd), x), ac))
    return addUnsigned(rotateLeft(aa, s), bb)
  }

  for (let i = 0; i < wordArray.length; i += 16) {
    const oa = a
    const ob = b
    const oc = c
    const od = d

    a = FF(a, b, c, d, wordArray[i + 0], 7, 0xd76aa478)
    d = FF(d, a, b, c, wordArray[i + 1], 12, 0xe8c7b756)
    c = FF(c, d, a, b, wordArray[i + 2], 17, 0x242070db)
    b = FF(b, c, d, a, wordArray[i + 3], 22, 0xc1bdceee)
    a = FF(a, b, c, d, wordArray[i + 4], 7, 0xf57c0faf)
    d = FF(d, a, b, c, wordArray[i + 5], 12, 0x4787c62a)
    c = FF(c, d, a, b, wordArray[i + 6], 17, 0xa8304613)
    b = FF(b, c, d, a, wordArray[i + 7], 22, 0xfd469501)
    a = FF(a, b, c, d, wordArray[i + 8], 7, 0x698098d8)
    d = FF(d, a, b, c, wordArray[i + 9], 12, 0x8b44f7af)
    c = FF(c, d, a, b, wordArray[i + 10], 17, 0xffff5bb1)
    b = FF(b, c, d, a, wordArray[i + 11], 22, 0x895cd7be)
    a = FF(a, b, c, d, wordArray[i + 12], 7, 0x6b901122)
    d = FF(d, a, b, c, wordArray[i + 13], 12, 0xfd987193)
    c = FF(c, d, a, b, wordArray[i + 14], 17, 0xa679438e)
    b = FF(b, c, d, a, wordArray[i + 15], 22, 0x49b40821)

    a = GG(a, b, c, d, wordArray[i + 1], 5, 0xf61e2562)
    d = GG(d, a, b, c, wordArray[i + 6], 9, 0xc040b340)
    c = GG(c, d, a, b, wordArray[i + 11], 14, 0x265e5a51)
    b = GG(b, c, d, a, wordArray[i + 0], 20, 0xe9b6c7aa)
    a = GG(a, b, c, d, wordArray[i + 5], 5, 0xd62f105d)
    d = GG(d, a, b, c, wordArray[i + 10], 9, 0x02441453)
    c = GG(c, d, a, b, wordArray[i + 15], 14, 0xd8a1e681)
    b = GG(b, c, d, a, wordArray[i + 4], 20, 0xe7d3fbc8)
    a = GG(a, b, c, d, wordArray[i + 9], 5, 0x21e1cde6)
    d = GG(d, a, b, c, wordArray[i + 14], 9, 0xc33707d6)
    c = GG(c, d, a, b, wordArray[i + 3], 14, 0xf4d50d87)
    b = GG(b, c, d, a, wordArray[i + 8], 20, 0x455a14ed)
    a = GG(a, b, c, d, wordArray[i + 13], 5, 0xa9e3e905)
    d = GG(d, a, b, c, wordArray[i + 2], 9, 0xfcefa3f8)
    c = GG(c, d, a, b, wordArray[i + 7], 14, 0x676f02d9)
    b = GG(b, c, d, a, wordArray[i + 12], 20, 0x8d2a4c8a)

    a = HH(a, b, c, d, wordArray[i + 5], 4, 0xfffa3942)
    d = HH(d, a, b, c, wordArray[i + 8], 11, 0x8771f681)
    c = HH(c, d, a, b, wordArray[i + 11], 16, 0x6d9d6122)
    b = HH(b, c, d, a, wordArray[i + 14], 23, 0xfde5380c)
    a = HH(a, b, c, d, wordArray[i + 1], 4, 0xa4beea44)
    d = HH(d, a, b, c, wordArray[i + 4], 11, 0x4bdecfa9)
    c = HH(c, d, a, b, wordArray[i + 7], 16, 0xf6bb4b60)
    b = HH(b, c, d, a, wordArray[i + 10], 23, 0xbebfbc70)
    a = HH(a, b, c, d, wordArray[i + 13], 4, 0x289b7ec6)
    d = HH(d, a, b, c, wordArray[i + 0], 11, 0xeaa127fa)
    c = HH(c, d, a, b, wordArray[i + 3], 16, 0xd4ef3085)
    b = HH(b, c, d, a, wordArray[i + 6], 23, 0x04881d05)
    a = HH(a, b, c, d, wordArray[i + 9], 4, 0xd9d4d039)
    d = HH(d, a, b, c, wordArray[i + 12], 11, 0xe6db99e5)
    c = HH(c, d, a, b, wordArray[i + 15], 16, 0x1fa27cf8)
    b = HH(b, c, d, a, wordArray[i + 2], 23, 0xc4ac5665)

    a = II(a, b, c, d, wordArray[i + 0], 6, 0xf4292244)
    d = II(d, a, b, c, wordArray[i + 7], 10, 0x432aff97)
    c = II(c, d, a, b, wordArray[i + 14], 15, 0xab9423a7)
    b = II(b, c, d, a, wordArray[i + 5], 21, 0xfc93a039)
    a = II(a, b, c, d, wordArray[i + 12], 6, 0x655b59c3)
    d = II(d, a, b, c, wordArray[i + 3], 10, 0x8f0ccc92)
    c = II(c, d, a, b, wordArray[i + 10], 15, 0xffeff47d)
    b = II(b, c, d, a, wordArray[i + 1], 21, 0x85845dd1)
    a = II(a, b, c, d, wordArray[i + 8], 6, 0x6fa87e4f)
    d = II(d, a, b, c, wordArray[i + 15], 10, 0xfe2ce6e0)
    c = II(c, d, a, b, wordArray[i + 6], 15, 0xa3014314)
    b = II(b, c, d, a, wordArray[i + 13], 21, 0x4e0811a1)
    a = II(a, b, c, d, wordArray[i + 4], 6, 0xf7537e82)
    d = II(d, a, b, c, wordArray[i + 11], 10, 0xbd3af235)
    c = II(c, d, a, b, wordArray[i + 2], 15, 0x2ad7d2bb)
    b = II(b, c, d, a, wordArray[i + 9], 21, 0xeb86d391)

    a = addUnsigned(a, oa)
    b = addUnsigned(b, ob)
    c = addUnsigned(c, oc)
    d = addUnsigned(d, od)
  }

  const toHex = (value: number) => {
    let hex = ''
    for (let i = 0; i <= 3; i += 1) {
      const byte = (value >>> (i * 8)) & 255
      hex += ('0' + byte.toString(16)).slice(-2)
    }
    return hex
  }

  return (toHex(a) + toHex(b) + toHex(c) + toHex(d)).toLowerCase()
}
const FAVORITE_SLOTS = 16

const normalizeFavorites = (favorites: number[] | undefined, patchCount: number): number[] => {
  const slots = FAVORITE_SLOTS
  if (patchCount <= 0) {
    return Array.from({ length: slots }, () => 0)
  }

  const fallback = Array.from({ length: slots }, (_, index) => index % patchCount)
  const input = favorites ?? fallback

  const result: number[] = []
  for (let i = 0; i < slots; i += 1) {
    const candidate = input[i]
    if (Number.isFinite(candidate)) {
      const value = Math.trunc(candidate as number)
      result.push(Math.min(Math.max(value, 0), patchCount - 1))
    } else {
      result.push(fallback[i])
    }
  }

  return result
}

const buildFavoriteDataXml = (favorites: number[], patchCount: number): string => {
  const slots = normalizeFavorites(favorites, patchCount)
  const padded = [...slots]
  while (padded.length < FAVORITE_SLOTS) {
    padded.push(padded[padded.length - 1] ?? 0)
  }
  const bankA = padded.slice(0, 8)
  const bankB = padded.slice(8, 16)

  const renderBank = (values: number[]) =>
    values
      .map((value) => `    <Data>${value}</Data>`)
      .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>

<xd_Favorite>
  <Bank>
${renderBank(bankA)}
  </Bank>
  <Bank>
${renderBank(bankB)}
  </Bank>
</xd_Favorite>
`
}

const parseFavoriteData = (xml: string, patchCount: number): {
  favorites: number[]
  clamped: boolean
  originalLength: number
} => {
  const values: number[] = []

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const nodes = Array.from(doc.querySelectorAll('Data'))
      if (nodes.length) {
        nodes.forEach((node) => {
          const raw = parseInt(node.textContent ?? '', 10)
          if (!Number.isNaN(raw)) values.push(raw)
        })
      }
    } catch (error) {
      console.warn('Failed to parse favorite data xml via DOMParser', error)
    }
  }

  if (!values.length) {
    const fallback = xml.match(/<Data>(\d+)<\/Data>/g)
    if (fallback) {
      fallback.forEach((entry) => {
        const num = parseInt(entry.replace(/\D/g, ''), 10)
        if (!Number.isNaN(num)) values.push(num)
      })
    }
  }

  const normalized = normalizeFavorites(values, patchCount)
  let clamped = false
  normalized.forEach((value, idx) => {
    const original = values[idx]
    if (typeof original === 'number' && original !== value) {
      clamped = true
    }
  })

  return { favorites: normalized, clamped, originalLength: values.length }
}

const basePresetDefaults = {
  name: 'minilogue xd preset pack',
  author: 'Unknown',
  version: '1.0',
  dataId: 'preset-pack',
  prefix: '',
  copyright: '',
} as const

const defaultPresetDate = () => new Date().toISOString().slice(0, 10)

export const createDefaultPresetFields = (): PresetInformationFields => ({
  dataId: basePresetDefaults.dataId,
  name: basePresetDefaults.name,
  author: basePresetDefaults.author,
  version: basePresetDefaults.version,
  numOfProg: '0',
  date: defaultPresetDate(),
  prefix: basePresetDefaults.prefix,
  copyright: basePresetDefaults.copyright,
})

export type XdCollectionKind = 'library' | 'preset'

export type PatchStatus = 'normal' | 'factory' | 'init'

export interface RawXdPatch {
  index: number
  name: string
  progBin: Uint8Array
  progInfoXml: string
  comment?: string | null
  programmer?: string | null
  status?: PatchStatus
  hash: string
}

export interface XdCollectionMetadata {
  kind: XdCollectionKind
  presetInfoXml?: string
  fileInformationXml: string
  favoriteDataPresent: boolean
  rawFiles: Record<string, Uint8Array>
  sourceName?: string
  presetFields?: Partial<PresetInformationFields>
  favorites?: number[]
  warnings?: string[]
  toolVersion?: string
  buildTimestamp?: string
}

export interface XdCollection {
  patches: RawXdPatch[]
  metadata: XdCollectionMetadata
}

export interface PresetInformationFields {
  dataId: string
  name: string
  author: string
  version: string
  numOfProg: string
  date: string
  prefix: string
  copyright: string
}

export interface BuildCollectionOptions {
  kind: XdCollectionKind
  presetInfo?: Partial<PresetInformationFields>
  favorites?: number[]
}

const padIndex = (index: number) => index.toString().padStart(3, '0')

const collectEntries = (input: ArrayBuffer) => unzipSync(new Uint8Array(input))

const readText = (data?: Uint8Array) => (data ? strFromU8(data) : undefined)

const createNameSanitiser = () => {
  const seen = new Map<string, number>()
  return (name: string) => {
    const normalised = name.replace(/[^\w\-+]/g, '_') || 'Patch'
    if (!seen.has(normalised)) {
      seen.set(normalised, 0)
      return normalised
    }
    const next = (seen.get(normalised) ?? 0) + 1
    seen.set(normalised, next)
    const candidate = `${normalised}-${next}`
    seen.set(candidate, 0)
    return candidate
  }
}

const extractProgramName = (progBin: Uint8Array) => {
  if (progBin.length < XD_PATCH_SIZE) {
    throw new Error('Unexpected program binary size – expected minilogue xd patch data')
  }
  const slice = progBin.subarray(PROGRAM_NAME_OFFSET, PROGRAM_NAME_OFFSET + PROGRAM_NAME_LENGTH)
  const zeroIndex = slice.findIndex((byte) => byte === 0)
  const nameBytes = zeroIndex >= 0 ? slice.subarray(0, zeroIndex) : slice
  return textDecoder.decode(nameBytes).trim() || 'Untitled'
}

const extractProgInfoField = (xml: string, tag: string): string | null => {
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const element = doc.querySelector(tag)
      if (element && element.textContent) {
        return element.textContent.trim()
      }
    } catch (err) {
      console.warn('Failed to parse prog_info xml', err)
    }
  }
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))
  return match ? match[1].trim() : null
}

const parsePresetInformation = (xml: string): PresetInformationFields => {
  const defaults = createDefaultPresetFields()
  const pairs: Array<[keyof PresetInformationFields, string]> = [
    ['dataId', 'DataID'],
    ['name', 'Name'],
    ['author', 'Author'],
    ['version', 'Version'],
    ['numOfProg', 'NumOfProg'],
    ['date', 'Date'],
    ['prefix', 'Prefix'],
    ['copyright', 'Copyright'],
  ]

  return pairs.reduce((acc, [key, xmlTag]) => {
    const value = extractProgInfoField(xml, xmlTag)
    acc[key] = value ?? defaults[key]
    return acc
  }, {} as PresetInformationFields)
}

type FileInfoOptions = {
  includePresetInformation: boolean
  includeFavoriteData: boolean
  metadata?: {
    toolName: string
    version: string
    buildTimestamp: string
  }
}

const buildFileInformationXml = (
  count: number,
  options: FileInfoOptions,
) => {
  const entries = Array.from({ length: count }, (_, index) => {
    const ident = padIndex(index)
    return `    <ProgramData>
      <Information>Prog_${ident}.prog_info</Information>
      <ProgramBinary>Prog_${ident}.prog_bin</ProgramBinary>
    </ProgramData>`
  }).join('\n')

  const includeFavorite = options.includeFavoriteData
  const includePreset = options.includePresetInformation

  const attributes = [
    `NumProgramData="${count}"`,
    `NumPresetInformation="${includePreset ? 1 : 0}"`,
    `NumTuneScaleData="0"`,
    `NumTuneOctData="0"`,
    `NumLivesetData="0"`,
    `NumFavoriteData="${includeFavorite ? 1 : 0}"`,
  ]

  const metadataBlock = options.metadata
    ? `    <XDConverter>
      <Name>${options.metadata.toolName}</Name>
      <Version>${options.metadata.version}</Version>
      <BuildTimestamp>${options.metadata.buildTimestamp}</BuildTimestamp>
    </XDConverter>`
    : ''

  const presetBlock = includePreset
    ? `    <PresetInformation>
      <File>PresetInformation.xml</File>
    </PresetInformation>`
    : ''

  const favoriteBlock = includeFavorite
    ? `    <FavoriteData>
      <File>FavoriteData.fav_data</File>
    </FavoriteData>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>

<KorgMSLibrarian_Data>
  <Product>minilogue xd</Product>
  <Contents ${attributes.join(' ')}>
${metadataBlock ? `${metadataBlock}\n` : ''}${presetBlock ? `${presetBlock}\n` : ''}${favoriteBlock ? `${favoriteBlock}\n` : ''}${entries}
  </Contents>
</KorgMSLibrarian_Data>
`
}

const buildPresetInformationXml = (fields: PresetInformationFields, progCount: number) => {
  const defaults = createDefaultPresetFields()
  defaults.numOfProg = String(progCount)
  const merged: PresetInformationFields = {
    dataId: fields.dataId || defaults.dataId,
    name: fields.name || defaults.name,
    author: fields.author || defaults.author,
    version: fields.version || defaults.version,
    numOfProg: fields.numOfProg || defaults.numOfProg,
    date: fields.date || defaults.date,
    prefix: fields.prefix || defaults.prefix,
    copyright: fields.copyright ?? defaults.copyright,
  }

  return `<?xml version="1.0" encoding="UTF-8"?>

<xd_Preset>
  <DataID>${merged.dataId}</DataID>
  <Name>${merged.name}</Name>
  <Author>${merged.author}</Author>
  <Version>${merged.version}</Version>
  <NumOfProg>${merged.numOfProg}</NumOfProg>
  <Date>${merged.date}</Date>
  <Prefix>${merged.prefix}</Prefix>
  <Copyright>${merged.copyright}</Copyright>
</xd_Preset>
`
}

const toUint8 = (value: string) => strToU8(value, true)

const toZippable = (entries: Record<string, string | Uint8Array>): Zippable => {
  const output: Record<string, Uint8Array> = {}
  for (const [key, value] of Object.entries(entries)) {
    output[key] = typeof value === 'string' ? toUint8(value) : value
  }
  return output
}

export const parseXdCollection = (buffer: ArrayBuffer, sourceName?: string): XdCollection => {
  const files = collectEntries(buffer)
  const patches: RawXdPatch[] = []
  const warnings: string[] = []

  const favoriteData = files['FavoriteData.fav_data']
  const progInfoEntries = Object.keys(files).filter((name) => name.endsWith('.prog_info'))
  const unmatchedProgInfo = new Set(progInfoEntries)
  const duplicateNames = new Map<string, number>()
  const statusCounts = { factory: 0, init: 0 }

  for (const [name, data] of Object.entries(files)) {
    const binMatch = name.match(PROG_BIN_REGEX)
    if (!binMatch) continue

    const index = Number(binMatch[1])
    const progInfoName = `Prog_${padIndex(index)}.prog_info`
    const progInfo = readText(files[progInfoName])
    if (!progInfo) {
      warnings.push(`Missing ${progInfoName} for patch index ${index}`)
      continue
    }
    unmatchedProgInfo.delete(progInfoName)

    const hash = md5(data)
    const patchName = extractProgramName(data)
    duplicateNames.set(patchName, (duplicateNames.get(patchName) ?? 0) + 1)
    const comment = extractProgInfoField(progInfo, 'Comment')
    const programmer = extractProgInfoField(progInfo, 'Programmer')
    const status: PatchStatus = initHashSet.has(hash) ? 'init' : factoryHashSet.has(hash) ? 'factory' : 'normal'
    if (status === 'factory') statusCounts.factory += 1
    if (status === 'init') statusCounts.init += 1
    patches.push({ index, name: patchName, progBin: data, progInfoXml: progInfo, comment, programmer, status, hash })
  }

  patches.sort((a, b) => a.index - b.index)

  if (!patches.length) {
    throw new Error('No minilogue xd patches found in archive')
  }

  if (unmatchedProgInfo.size) {
    warnings.push(`Found ${unmatchedProgInfo.size} prog_info entries without matching prog_bin data`)
  }

  duplicateNames.forEach((count, name) => {
    if (count > 1) {
      warnings.push(`Duplicate patch name "${name}" appears ${count} times`)
    }
  })

  if (statusCounts.factory > 0) {
    warnings.push(`Contains ${statusCounts.factory} factory patches`)
  }
  if (statusCounts.init > 0) {
    warnings.push(`Contains ${statusCounts.init} init patches`)
  }

  const fileInformationXml = readText(files['FileInformation.xml'])
  if (!fileInformationXml) {
    throw new Error('FileInformation.xml is missing from archive')
  }

  const counts = parseFileInformationCounts(fileInformationXml)
  if (typeof counts.programData === 'number' && counts.programData !== patches.length) {
    warnings.push(
      `FileInformation.xml reports ${counts.programData} programs but archive contains ${patches.length}`,
    )
  }

  if (counts.favoriteData && !favoriteData) {
    warnings.push('FileInformation.xml references favorite data but FavoriteData.fav_data is missing')
  }

  if (!counts.favoriteData && favoriteData) {
    warnings.push('FavoriteData.fav_data present but FileInformation.xml does not list favorite data')
  }

  const { toolVersion, buildTimestamp } = parseConverterMetadata(fileInformationXml)

  let parsedFavorites: number[] | undefined
  if (favoriteData && patches.length) {
    const favoriteResult = parseFavoriteData(strFromU8(favoriteData), patches.length)
    parsedFavorites = favoriteResult.favorites
    if (favoriteResult.clamped) {
      warnings.push('Favorite slots referencing out-of-range patches were adjusted')
    }
    if (favoriteResult.originalLength < FAVORITE_SLOTS) {
      warnings.push('Favorite data contained fewer than 16 slots; remaining slots were filled automatically')
    }
  }

  const presetInfoXml = readText(files['PresetInformation.xml'])
  const metadata: XdCollectionMetadata = {
    kind: presetInfoXml ? 'preset' : 'library',
    presetInfoXml,
    fileInformationXml,
    favoriteDataPresent: Boolean(favoriteData),
    rawFiles: files,
    sourceName,
    presetFields: presetInfoXml ? parsePresetInformation(presetInfoXml) : undefined,
    favorites: parsedFavorites,
    toolVersion,
    buildTimestamp,
    warnings: warnings.length ? warnings : undefined,
  }

  return { patches, metadata }
}

export const parseXdPatch = (buffer: ArrayBuffer): RawXdPatch => {
  const files = collectEntries(buffer)
  const progBinEntry = Object.entries(files).find(([name]) => PROG_BIN_REGEX.test(name))
  if (!progBinEntry) {
    throw new Error('Invalid patch archive: missing Prog_000.prog_bin')
  }
  const [progBinName, progBin] = progBinEntry
  const index = Number(progBinName.match(PROG_BIN_REGEX)![1])
  const progInfoName = `Prog_${padIndex(index)}.prog_info`
  const progInfo = readText(files[progInfoName])
  if (!progInfo) {
    throw new Error('Invalid patch archive: missing prog_info data')
  }
  const name = extractProgramName(progBin)
  const comment = extractProgInfoField(progInfo, 'Comment')
  const programmer = extractProgInfoField(progInfo, 'Programmer')
  const hash = md5(progBin)
  const status: PatchStatus = initHashSet.has(hash) ? 'init' : factoryHashSet.has(hash) ? 'factory' : 'normal'

  return {
    index,
    name,
    progBin,
    progInfoXml: progInfo,
    comment,
    programmer,
    status,
    hash,
  }
}

export const buildXdPatchArchive = (patch: RawXdPatch): Uint8Array => {
  const ident = padIndex(0)
  const fileInfoXml = buildFileInformationXml(1, {
    includePresetInformation: false,
    includeFavoriteData: false,
    metadata: buildMetadata(),
  })
  const payload = toZippable({
    [`Prog_${ident}.prog_bin`]: patch.progBin,
    [`Prog_${ident}.prog_info`]: patch.progInfoXml,
    'FileInformation.xml': fileInfoXml,
  })

  return zipSync(payload, { level: 9 })
}

export const buildXdCollectionArchive = (
  patches: RawXdPatch[],
  options: BuildCollectionOptions,
): Uint8Array => {
  if (!patches.length) {
    throw new Error('At least one patch is required to build a collection')
  }

  const ordered = [...patches].map((patch, idx) => ({ ...patch, index: idx }))

  const baseEntries: Record<string, string | Uint8Array> = {}

  ordered.forEach((patch, idx) => {
    const ident = padIndex(idx)
    baseEntries[`Prog_${ident}.prog_bin`] = patch.progBin
    baseEntries[`Prog_${ident}.prog_info`] = patch.progInfoXml
  })

  const includePreset = options.kind === 'preset'
  const defaultFields = createDefaultPresetFields()
  defaultFields.numOfProg = String(ordered.length)
  const fields: PresetInformationFields = {
    ...defaultFields,
    ...(options.presetInfo ?? {}),
  }

  const favorites = normalizeFavorites(options.favorites, ordered.length)

  baseEntries['FileInformation.xml'] = buildFileInformationXml(ordered.length, {
    includePresetInformation: includePreset,
    includeFavoriteData: !includePreset && ordered.length > 1,
    metadata: buildMetadata(),
  })

  if (includePreset) {
    baseEntries['PresetInformation.xml'] = buildPresetInformationXml(fields, ordered.length)
  } else if (ordered.length > 1) {
    baseEntries['FavoriteData.fav_data'] = buildFavoriteDataXml(favorites, ordered.length)
  }

  return zipSync(toZippable(baseEntries), { level: 9 })
}

export const buildBulkPatchZip = (patches: RawXdPatch[]) => {
  const entries: Record<string, Uint8Array> = {}
  const sanitise = createNameSanitiser()
  patches.forEach((patch) => {
    const archive = buildXdPatchArchive(patch)
    const filename = `${sanitise(patch.name)}.mnlgxdprog`
    entries[filename] = archive
  })
  return zipSync(entries, { level: 9 })
}

export const bufferToBlob = (buffer: Uint8Array, mime = 'application/octet-stream') =>
  new Blob([buffer], { type: mime })

export const textToBlob = (value: string, mime = 'application/xml') =>
  new Blob([textEncoder.encode(value)], { type: mime })

export const normalizeFavoriteSlots = (favorites: number[] | undefined, patchCount: number) =>
  normalizeFavorites(favorites, patchCount)

export const defaultFavoriteSlots = (patchCount: number) => normalizeFavorites(undefined, patchCount)

const buildMetadata = () => ({
  toolName: 'xd-converter',
  version: APP_VERSION,
  buildTimestamp: BUILD_TIMESTAMP,
})

const parseConverterMetadata = (xml: string): {
  toolVersion?: string
  buildTimestamp?: string
} => {
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const node = doc.querySelector('XDConverter')
      if (node) {
        const version = node.querySelector('Version')?.textContent?.trim()
        const timestamp = node.querySelector('BuildTimestamp')?.textContent?.trim()
        return {
          toolVersion: version || undefined,
          buildTimestamp: timestamp || undefined,
        }
      }
    } catch (error) {
      console.warn('Failed to parse converter metadata via DOMParser', error)
    }
  }

  const versionMatch = xml.match(/<XDConverter>[\s\S]*?<Version>([^<]*)<\/Version>/)
  const timestampMatch = xml.match(/<XDConverter>[\s\S]*?<BuildTimestamp>([^<]*)<\/BuildTimestamp>/)

  return {
    toolVersion: versionMatch ? versionMatch[1].trim() : undefined,
    buildTimestamp: timestampMatch ? timestampMatch[1].trim() : undefined,
  }
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const setXmlTagValue = (xml: string, tag: string, value: string): string => {
  const safeValue = escapeXml(value)

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const element = doc.querySelector(tag)
      if (element) {
        element.textContent = value
        return new XMLSerializer().serializeToString(doc)
      }
    } catch (error) {
      console.warn('Failed to update XML via DOMParser', error)
    }
  }

  const pattern = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`)
  if (pattern.test(xml)) {
    return xml.replace(pattern, `<${tag}>${safeValue}</${tag}>`)
  }

  return xml
}

const writeProgramName = (progBin: Uint8Array, name: string): Uint8Array => {
  const copy = new Uint8Array(progBin)
  const encoded = textEncoder.encode(name)
  copy.fill(0, PROGRAM_NAME_OFFSET, PROGRAM_NAME_OFFSET + PROGRAM_NAME_LENGTH)
  copy.set(encoded.subarray(0, PROGRAM_NAME_LENGTH), PROGRAM_NAME_OFFSET)
  return copy
}

export const updatePatchName = (patch: RawXdPatch, name: string): RawXdPatch => {
  const trimmed = name.trim()
  const sanitizedBase = trimmed ? trimmed : 'Untitled'
  const sanitized = sanitizedBase.slice(0, PROGRAM_NAME_LENGTH)
  const updatedBin = writeProgramName(patch.progBin, sanitized)
  let updatedInfo = patch.progInfoXml
  updatedInfo = setXmlTagValue(updatedInfo, 'Name', sanitized)
  updatedInfo = setXmlTagValue(updatedInfo, 'ProgramName', sanitized)
  return {
    ...patch,
    name: sanitized,
    progBin: updatedBin,
    progInfoXml: updatedInfo,
  }
}

export const updatePatchComment = (patch: RawXdPatch, comment: string): RawXdPatch => {
  const normalized = comment.trim()
  const updatedInfo = setXmlTagValue(patch.progInfoXml, 'Comment', normalized)
  return {
    ...patch,
    comment: normalized || undefined,
    progInfoXml: updatedInfo,
  }
}

const parseFileInformationCounts = (xml: string): {
  programData?: number
  favoriteData?: number
  presetInformation?: number
} => {
  const readAttr = (attr: string) => {
    const match = xml.match(new RegExp(`${attr}="(\d+)"`))
    return match ? Number(match[1]) : undefined
  }

  return {
    programData: readAttr('NumProgramData'),
    favoriteData: readAttr('NumFavoriteData'),
    presetInformation: readAttr('NumPresetInformation'),
  }
}
