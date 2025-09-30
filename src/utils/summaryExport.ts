import type { RawXdPatch } from '../lib/minilogueXd'
import { getPatchSummary } from './patchSummary'

export type SummaryExportFormat = 'csv' | 'json'
export type SummaryExportContext = {
  sourceName?: string | null
  context?: 'collection' | 'build' | 'patch'
}

export const toFilename = (value: string, fallback: string) => {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return fallback
  return trimmed.replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '') || fallback
}

const escapeCsvValue = (value: string) => {
  const sanitized = value.replace(/\r/g, '').replace(/\n/g, ' ')
  if (!sanitized) return ''
  const needsQuotes = sanitized.includes(',') || sanitized.includes('"')
  if (!needsQuotes) return sanitized
  return `"${sanitized.replace(/"/g, '""')}"`
}

export const createSummaryExportBlob = (
  patches: RawXdPatch[],
  format: SummaryExportFormat,
  options: SummaryExportContext = {},
) => {
  if (format === 'json') {
    const generatedAt = new Date().toISOString()
    const payload = {
      generatedAt,
      context: options.context ?? null,
      source: options.sourceName ?? null,
      patchCount: patches.length,
      patches: patches.map((patch) => {
        const summary = getPatchSummary(patch)
        return {
          index: patch.index,
          name: patch.name,
          hash: patch.hash,
          status: patch.status ?? 'normal',
          comment: patch.comment ?? null,
          programmer: patch.programmer ?? null,
          summary: summary.map((category) => ({
            label: category.label,
            rows: category.rows.map((row) => ({
              label: row.label,
              value: row.value,
              rawValue: row.rawValue ?? null,
              normalizedValue: row.normalizedValue ?? null,
            })),
          })),
        }
      }),
    }
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  }

  const header = [
    'Patch Index',
    'Patch Name',
    'Patch Hash',
    'Status',
    'Category',
    'Parameter',
    'Display Value',
    'Raw Value',
    'Normalized Value',
  ]

  const lines = [header.map((value) => escapeCsvValue(value)).join(',')]

  patches.forEach((patch) => {
    const summary = getPatchSummary(patch)
    if (summary.length === 0) {
      lines.push(
        [
          (patch.index + 1).toString(),
          patch.name,
          patch.hash,
          patch.status ?? 'normal',
          '',
          '',
          '',
          '',
          '',
        ]
          .map((value) => escapeCsvValue(value))
          .join(','),
      )
      return
    }

    summary.forEach((category) => {
      category.rows.forEach((row) => {
        const rawValue =
          row.rawValue == null
            ? ''
            : typeof row.rawValue === 'number'
            ? row.rawValue.toString()
            : row.rawValue
        const normalizedValue = row.normalizedValue != null ? row.normalizedValue.toFixed(3) : ''

        lines.push(
          [
            (patch.index + 1).toString(),
            patch.name,
            patch.hash,
            patch.status ?? 'normal',
            category.label,
            row.label,
            row.value,
            rawValue,
            normalizedValue,
          ]
            .map((value) => escapeCsvValue(value))
            .join(','),
        )
      })
    })
  })

  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
}
