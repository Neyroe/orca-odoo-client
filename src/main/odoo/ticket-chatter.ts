import { chatterHtmlToMarkdown, markdownToChatterHtml } from './chatter-html-markdown'
import { acquire, executeKw, getClients, release } from './client'
import {
  base64ImageDataUri,
  readMany2One,
  readString,
  toIsoDate,
  type OdooRecord
} from './ticket-mappers'
import type { OdooComment, OdooInstanceSelection, OdooMutationResult } from '../../shared/types'

/** Posts a markdown `body` to the ticket chatter as a message or internal note. */
export async function addTicketComment(
  id: number,
  body: string,
  isNote?: boolean,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooMutationResult> {
  const client = getClients(instanceId)[0]
  if (!client) {
    return { ok: false, error: 'Not connected to Odoo.' }
  }
  await acquire()
  try {
    // mt_note posts an internal "Log note" (no follower notification); mt_comment
    // notifies followers like Odoo's "Send message". body_is_html keeps the HTML
    // intact: message_post escapes plain strings, and RPC cannot pass a Markup.
    await executeKw<number>(client, 'project.task', 'message_post', [[id]], {
      body: markdownToChatterHtml(body),
      body_is_html: true,
      message_type: 'comment',
      subtype_xmlid: isNote ? 'mail.mt_note' : 'mail.mt_comment'
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not post comment.' }
  } finally {
    release()
  }
}

export async function getTicketComments(
  id: number,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooComment[]> {
  const client = getClients(instanceId)[0]
  if (!client) {
    return []
  }
  await acquire()
  try {
    const rows = await executeKw<OdooRecord[]>(
      client,
      'mail.message',
      'search_read',
      [
        [
          ['model', '=', 'project.task'],
          ['res_id', '=', id],
          // Odoo logs field changes as `notification` messages; only real
          // comments and inbound email belong in a ticket discussion.
          ['message_type', 'in', ['comment', 'email']]
        ]
      ],
      { fields: ['id', 'body', 'date', 'author_id', 'subtype_id'], order: 'date asc' }
    )

    const distinctIds = (pick: (row: OdooRecord) => unknown): number[] => [
      ...new Set(
        rows.flatMap((row) => {
          const ref = readMany2One(pick(row))
          return ref ? [ref.id] : []
        })
      )
    ]

    // A "note" is any message whose subtype is internal; resolve the internal
    // flag and author avatars in one batch read each to avoid per-row round trips.
    const subtypeIds = distinctIds((row) => row.subtype_id)
    const authorIds = distinctIds((row) => row.author_id)
    const [subtypes, partners] = await Promise.all([
      subtypeIds.length > 0
        ? executeKw<OdooRecord[]>(client, 'mail.message.subtype', 'read', [subtypeIds], {
            fields: ['internal']
          })
        : Promise.resolve([]),
      authorIds.length > 0
        ? executeKw<OdooRecord[]>(client, 'res.partner', 'read', [authorIds], {
            fields: ['avatar_128']
          })
        : Promise.resolve([])
    ])
    const internalById = new Map(subtypes.map((s) => [s.id as number, s.internal === true]))
    const avatarById = new Map<number, string>()
    for (const partner of partners) {
      const uri = base64ImageDataUri(partner.avatar_128)
      if (uri) {
        avatarById.set(partner.id as number, uri)
      }
    }

    return rows.map((row) => {
      const author = readMany2One(row.author_id)
      const subtype = readMany2One(row.subtype_id)
      return {
        id: row.id as number,
        body: chatterHtmlToMarkdown(readString(row.body) ?? ''),
        createdAt: toIsoDate(row.date),
        author: author
          ? { id: author.id, displayName: author.name, avatarUrl: avatarById.get(author.id) }
          : undefined,
        isNote: subtype ? (internalById.get(subtype.id) ?? false) : false
      }
    })
  } finally {
    release()
  }
}
