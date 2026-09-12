import { useCallback } from 'react'
import { mobileApi, uploadCommentImage } from '../lib/api'
import { useToast } from '../components/Toast'

// 41j1jiea7l: the `mentions` + `onImage` pair a MarkdownEditor needs, in one
// place instead of per call site — comments had it, todo notes did not, which
// is the only reason the notes composer had no image button and no @ list.
// Both endpoints are gated server-side by the same _assert_comment_visible on
// this record, and upload_comment_image re-checks extension, MIME and size
// there; the check below is only so the user hears about it without a round trip.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function useMarkdownAttachments(referenceDoctype: string, referenceName: string) {
  const toast = useToast()
  const mentions = useCallback(
    () => mobileApi.getMentionableUsers(referenceDoctype, referenceName),
    [referenceDoctype, referenceName],
  )
  const onImage = useCallback(
    async (file: File) => {
      if (file.size > MAX_IMAGE_BYTES) {
        toast('error', 'Image too large (max 5 MB).')
        throw new Error('too large')
      }
      try {
        return await uploadCommentImage(file, referenceDoctype, referenceName)
      } catch (err) {
        toast('error', (err as Error).message || 'Upload failed')
        throw err
      }
    },
    [referenceDoctype, referenceName, toast],
  )
  return { mentions, onImage }
}
