import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playPatchPreview, supportsAudioPreview } from '../lib/audioPreview'
import type { PatchPreviewHandle } from '../lib/audioPreview'
import type { RawXdPatch } from '../lib/minilogueXd'

type PreviewStatus = 'idle' | 'pending' | 'playing'

export interface PatchPreviewState {
  supported: boolean
  status: PreviewStatus
  error: string | null
  play: (patch: RawXdPatch) => Promise<void>
  stop: () => void
}

export const usePatchPreview = (): PatchPreviewState => {
  const handleRef = useRef<PatchPreviewHandle | null>(null)
  const [supported, setSupported] = useState(() => supportsAudioPreview())
  const [status, setStatus] = useState<PreviewStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupported(supportsAudioPreview())
  }, [])

  useEffect(() => () => {
    handleRef.current?.stop()
    handleRef.current = null
  }, [])

  const stop = useCallback(() => {
    if (handleRef.current) {
      handleRef.current.stop()
      handleRef.current = null
    }
    setStatus('idle')
  }, [])

  const play = useCallback(
    async (patch: RawXdPatch) => {
      if (!supported) {
        setError('Audio preview is not supported in this browser')
        return
      }
      setError(null)
      setStatus('pending')
      handleRef.current?.stop()
      handleRef.current = null
      try {
        const handle = await playPatchPreview(patch)
        handleRef.current = handle
        setStatus('playing')
        handle.finished
          .catch((reason) => {
            console.warn('Audio preview ended with error', reason)
          })
          .finally(() => {
            if (handleRef.current === handle) {
              handleRef.current = null
              setStatus('idle')
            }
          })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to play preview'
        setError(message)
        setStatus('idle')
      }
    },
    [supported],
  )

  return useMemo(
    () => ({ supported, status, error, play, stop }),
    [supported, status, error, play, stop],
  )
}
