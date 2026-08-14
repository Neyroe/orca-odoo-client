import { createBrowserUuid } from '@/lib/browser-uuid'
import { translate } from '@/i18n/i18n'
import {
  MAX_ODOO_ATTACHMENT_COUNT,
  ODOO_ATTACHMENT_UPLOAD_MAX_BYTES
} from '../../../shared/odoo-attachment-upload-limit'

/** A file picked/dropped in the composer, pending upload alongside the comment. */
export type OdooAttachmentDraft = {
  id: string
  file: File
  name: string
  mimetype: string
  size: number
}

export { MAX_ODOO_ATTACHMENT_COUNT }
// Why: reuse the same cap odooUploadTicketAttachments enforces server-side so a
// file rejected here never differs from what the upload call would reject later.
export const MAX_ODOO_ATTACHMENT_BYTES = ODOO_ATTACHMENT_UPLOAD_MAX_BYTES

export function formatOdooAttachmentSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function attachmentDisplayName(file: File): string {
  return (
    file.name ||
    translate('auto.components.odoo.ticket.chatter.attachment_fallback_name', 'Attachment')
  )
}

// Why: base64 inflates raw bytes by ~4/3; estimate the encoded size so this
// pre-check rejects the same files odooUploadTicketAttachments would reject later.
function estimatedBase64Bytes(rawBytes: number): number {
  return Math.ceil((rawBytes * 4) / 3)
}

/**
 * Validates newly picked/dropped files against the count and size caps. Rejections
 * come back as messages instead of being silently dropped, matching the feedback
 * image attachment flow this mirrors. `existingBytes` is the raw size total of
 * files already staged in the composer, so a cumulative drop can't slip past the
 * shared upload cap one file at a time.
 */
export function validateOdooAttachmentSelection(
  files: readonly File[],
  existingCount: number,
  existingBytes = 0
): { accepted: OdooAttachmentDraft[]; errors: string[] } {
  const accepted: OdooAttachmentDraft[] = []
  const errors: string[] = []
  let remaining = MAX_ODOO_ATTACHMENT_COUNT - existingCount
  let rawByteTotal = existingBytes

  for (const file of files) {
    const fileName = attachmentDisplayName(file)
    if (file.size === 0) {
      errors.push(
        translate(
          'auto.components.odoo.ticket.chatter.attachment_empty',
          '{{fileName}} is empty.',
          {
            fileName
          }
        )
      )
      continue
    }
    if (estimatedBase64Bytes(rawByteTotal + file.size) > MAX_ODOO_ATTACHMENT_BYTES) {
      errors.push(
        translate(
          'auto.components.odoo.ticket.chatter.attachment_too_large',
          '{{fileName}} would exceed the {{maxSize}} attachment limit.',
          { fileName, maxSize: formatOdooAttachmentSize(MAX_ODOO_ATTACHMENT_BYTES) }
        )
      )
      continue
    }
    if (remaining <= 0) {
      errors.push(
        translate(
          'auto.components.odoo.ticket.chatter.attachment_too_many',
          'You can attach up to {{maxCount}} files.',
          { maxCount: MAX_ODOO_ATTACHMENT_COUNT }
        )
      )
      break
    }
    remaining -= 1
    rawByteTotal += file.size
    accepted.push({
      id: `${file.name}-${file.size}-${createBrowserUuid()}`,
      file,
      name: fileName,
      mimetype: file.type || 'application/octet-stream',
      size: file.size
    })
  }

  return { accepted, errors }
}

/** Strips the `data:<mime>;base64,` prefix `FileReader.readAsDataURL` produces. */
export function stripBase64DataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

/** Reads a File into the base64 payload `OdooAttachmentUpload.data` expects (no data: prefix). */
export function readOdooAttachmentAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read attachment'))
    reader.onload = () => resolve(stripBase64DataUrlPrefix(String(reader.result ?? '')))
    reader.readAsDataURL(file)
  })
}
