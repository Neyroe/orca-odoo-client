import { chatterHtmlToMarkdown, markdownToChatterHtml } from './chatter-html-markdown'
import { acquire, executeKw, getClients, release } from './client'
import { readMany2One, readString, toIsoDate, type OdooRecord } from './ticket-mappers'
import type { OdooComment, OdooInstanceSelection, OdooMutationResult } from '../../shared/types'

/** Posts a markdown `body` to the ticket chatter. */
export async function addTicketComment(
  id: number,
  body: string,
  instanceId?: OdooInstanceSelection | null
): Promise<OdooMutationResult> {
  const client = getClients(instanceId)[0]
  if (!client) {
    return { ok: false, error: 'Not connected to Odoo.' }
  }
  await acquire()
  try {
    // mt_comment is the chatter subtype that notifies followers; without it the
    // message posts as a silent log note. body_is_html keeps the HTML intact:
    // message_post escapes plain strings, and RPC cannot pass a Markup object.
    await executeKw<number>(client, 'project.task', 'message_post', [[id]], {
      body: markdownToChatterHtml(body),
      body_is_html: true,
      message_type: 'comment',
      subtype_xmlid: 'mail.mt_comment'
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
      { fields: ['id', 'body', 'date', 'author_id'], order: 'date asc' }
    )
    return rows.map((row) => {
      const author = readMany2One(row.author_id)
      return {
        id: row.id as number,
        body: chatterHtmlToMarkdown(readString(row.body) ?? ''),
        createdAt: toIsoDate(row.date),
        author: author ? { id: author.id, displayName: author.name } : undefined
      }
    })
  } finally {
    release()
  }
}
