import { ipcMain } from 'electron'
import {
  addTicketComment,
  getTicketComments,
  searchMentionCandidates,
  updateTicketComment,
  uploadTicketAttachments
} from '../odoo/ticket-chatter'
import { normalizeIdArray, normalizeInstanceId, normalizeRecordId } from './odoo-ipc-args'
import type { OdooAttachmentUpload } from '../../shared/odoo-types'
/** Registers the ticket-chatter slice of the Odoo IPC surface: comments, @mentions, attachments. */
export function registerOdooTicketChatterHandlers(): void {
  ipcMain.handle(
    'odoo:addTicketComment',
    async (
      _event,
      args: {
        id: number
        body: string
        isNote?: boolean
        instanceId?: string
        mentionPartnerIds?: number[]
        attachmentIds?: number[]
      }
    ) => {
      const id = normalizeRecordId(args?.id)
      if (id === null) {
        return { ok: false, error: 'Ticket ID is required.' }
      }
      if (typeof args?.body !== 'string' || !args.body.trim()) {
        return { ok: false, error: 'Comment body is required.' }
      }
      return addTicketComment(
        id,
        args.body.trim(),
        args.isNote,
        normalizeInstanceId(args.instanceId),
        normalizeIdArray(args.mentionPartnerIds),
        normalizeIdArray(args.attachmentIds)
      )
    }
  )

  ipcMain.handle(
    'odoo:updateTicketComment',
    async (_event, args: { id: number; body: string; instanceId?: string }) => {
      const id = normalizeRecordId(args?.id)
      if (id === null) {
        return { ok: false, error: 'Message ID is required.' }
      }
      if (typeof args?.body !== 'string' || !args.body.trim()) {
        return { ok: false, error: 'Comment body is required.' }
      }
      return updateTicketComment(id, args.body.trim(), normalizeInstanceId(args.instanceId))
    }
  )

  ipcMain.handle(
    'odoo:ticketComments',
    async (_event, args: { id: number; instanceId?: string }) => {
      const id = normalizeRecordId(args?.id)
      if (id === null) {
        return []
      }
      return getTicketComments(id, normalizeInstanceId(args.instanceId))
    }
  )

  ipcMain.handle(
    'odoo:searchMentionCandidates',
    async (_event, args: { ticketId: number; query?: string; instanceId?: string }) => {
      const ticketId = normalizeRecordId(args?.ticketId)
      if (ticketId === null) {
        return []
      }
      return searchMentionCandidates(
        ticketId,
        typeof args?.query === 'string' ? args.query : '',
        normalizeInstanceId(args.instanceId)
      )
    }
  )

  ipcMain.handle(
    'odoo:uploadTicketAttachments',
    async (
      _event,
      args: { ticketId: number; files: OdooAttachmentUpload[]; instanceId?: string }
    ) => {
      const ticketId = normalizeRecordId(args?.ticketId)
      if (ticketId === null) {
        return { ok: false, error: 'Ticket ID is required.' }
      }
      if (!Array.isArray(args?.files)) {
        return { ok: false, error: 'Files are required.' }
      }
      const files = args.files.filter(
        (file): file is OdooAttachmentUpload =>
          !!file &&
          typeof file.name === 'string' &&
          typeof file.mimetype === 'string' &&
          typeof file.data === 'string'
      )
      return uploadTicketAttachments(ticketId, files, normalizeInstanceId(args.instanceId))
    }
  )
}
