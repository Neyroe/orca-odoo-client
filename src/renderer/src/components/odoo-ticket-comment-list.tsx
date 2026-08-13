import { useState } from 'react'
import { LoaderCircle, Mail, Pencil, StickyNote } from 'lucide-react'

import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { OdooTicketCommentAttachmentList } from '@/components/odoo-ticket-comment-attachments'
import { OdooTicketCommentEditor } from '@/components/odoo-ticket-comment-editor'
import { OdooUserAvatar } from '@/components/odoo-user-avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { OdooComment, OdooTicket } from '../../../shared/types'

function formatCommentDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

/** Chatter history: notes render amber, messages emerald — Odoo's convention. */
export function OdooTicketCommentList({
  comments,
  loading,
  ticket,
  onCommentUpdated
}: {
  comments: OdooComment[]
  loading: boolean
  ticket: OdooTicket
  onCommentUpdated: () => void
}): React.JSX.Element {
  const [editingId, setEditingId] = useState<number | null>(null)

  if (loading) {
    return (
      <div className="mt-3 flex justify-center py-4">
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {translate('auto.components.odoo.ticket.workspace.c87b4521ce', 'No comments yet')}
      </p>
    )
  }
  return (
    <div className="mt-2 space-y-3">
      {comments.map((comment) => {
        const editing = editingId === comment.id
        return (
          <div
            key={comment.id}
            className={cn(
              'group rounded-md border px-3 py-2',
              comment.isNote
                ? 'border-amber-500/30 bg-amber-500/[0.06]'
                : 'border-emerald-500/30 bg-emerald-500/[0.06]'
            )}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div className="flex min-w-0 items-center gap-2">
                {comment.author ? (
                  <OdooUserAvatar user={comment.author} className="size-8" />
                ) : null}
                <span className="truncate text-xs font-medium text-foreground/80">
                  {comment.author?.displayName ?? '—'}
                </span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                    comment.isNote
                      ? 'border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  )}
                >
                  {comment.isNote ? (
                    <StickyNote className="size-2.5" />
                  ) : (
                    <Mail className="size-2.5" />
                  )}
                  {comment.isNote
                    ? translate('auto.components.odoo.ticket.workspace.note_label', 'Note')
                    : translate('auto.components.odoo.ticket.workspace.message_label', 'Message')}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span>{formatCommentDate(comment.createdAt)}</span>
                {comment.canEdit && !editing ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setEditingId(comment.id)}
                        aria-label={translate(
                          'auto.components.odoo.ticket.chatter.edit_button',
                          'Edit message'
                        )}
                        className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <Pencil className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={4}>
                      {translate('auto.components.odoo.ticket.chatter.edit_button', 'Edit message')}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
            {editing ? (
              <OdooTicketCommentEditor
                comment={comment}
                ticket={ticket}
                onSaved={() => {
                  setEditingId(null)
                  onCommentUpdated()
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <CommentMarkdown className="mt-1.5" content={comment.body} />
                {comment.attachments ? (
                  <OdooTicketCommentAttachmentList attachments={comment.attachments} />
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
