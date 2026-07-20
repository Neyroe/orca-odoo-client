import { useState } from 'react'
import { LoaderCircle, Mail, StickyNote } from 'lucide-react'
import { toast } from 'sonner'

import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { OdooUserAvatar } from '@/components/odoo-user-avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { odooAddTicketComment } from '@/runtime/runtime-odoo-client'
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
  loading
}: {
  comments: OdooComment[]
  loading: boolean
}): React.JSX.Element {
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
      {comments.map((comment) => (
        <div
          key={comment.id}
          className={cn(
            'rounded-md border px-3 py-2',
            comment.isNote
              ? 'border-amber-500/30 bg-amber-500/[0.06]'
              : 'border-emerald-500/30 bg-emerald-500/[0.06]'
          )}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {comment.author ? <OdooUserAvatar user={comment.author} className="size-8" /> : null}
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
            <span className="shrink-0">{formatCommentDate(comment.createdAt)}</span>
          </div>
          <CommentMarkdown className="mt-1.5" content={comment.body} />
        </div>
      ))}
    </div>
  )
}

/** Composer with a Message / Log note toggle mirroring Odoo's chatter tabs. */
export function OdooTicketCommentComposer({
  ticket,
  onPosted
}: {
  ticket: OdooTicket
  onPosted: () => void
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const [commentDraft, setCommentDraft] = useState('')
  // Default to an internal Log note (user preference): most chatter entries here
  // are internal notes, and a public message is the deliberate opt-in.
  const [commentIsNote, setCommentIsNote] = useState(true)
  const [commentPosting, setCommentPosting] = useState(false)

  const postComment = async (): Promise<void> => {
    const body = commentDraft.trim()
    if (!body || commentPosting) {
      return
    }
    setCommentPosting(true)
    try {
      const result = await odooAddTicketComment(
        settings,
        ticket.id,
        body,
        commentIsNote,
        ticket.instanceId
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCommentDraft('')
      toast.success(
        commentIsNote
          ? translate('auto.components.odoo.ticket.workspace.note_posted', 'Note logged.')
          : translate('auto.components.odoo.ticket.workspace.8b2db83b43', 'Comment posted.')
      )
      onPosted()
    } catch {
      toast.error(
        translate('auto.components.odoo.ticket.workspace.c243d3a215', 'Could not post the comment.')
      )
    } finally {
      setCommentPosting(false)
    }
  }

  return (
    <form
      className="flex flex-none flex-col gap-2 border-t border-border/50 px-5 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        void postComment()
      }}
    >
      <div className="flex items-center gap-1 self-start rounded-md border border-border/60 p-0.5">
        {[
          {
            note: false,
            icon: <Mail className="size-3" />,
            label: translate('auto.components.odoo.ticket.workspace.compose_message', 'Message')
          },
          {
            note: true,
            icon: <StickyNote className="size-3" />,
            label: translate('auto.components.odoo.ticket.workspace.compose_note', 'Log note')
          }
        ].map((mode) => {
          const active = commentIsNote === mode.note
          return (
            <button
              key={String(mode.note)}
              type="button"
              aria-pressed={active}
              onClick={() => setCommentIsNote(mode.note)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
                active
                  ? mode.note
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {mode.icon}
              {mode.label}
            </button>
          )
        })}
      </div>
      <textarea
        value={commentDraft}
        onChange={(event) => setCommentDraft(event.target.value)}
        placeholder={
          commentIsNote
            ? translate(
                'auto.components.odoo.ticket.workspace.note_placeholder',
                'Log an internal note…'
              )
            : translate('auto.components.odoo.ticket.workspace.1b5eaa43b5', 'Add a comment…')
        }
        rows={2}
        disabled={commentPosting}
        onKeyDown={(event) => {
          // Cross-platform submit: ⌘⏎ on Mac, Ctrl+Enter elsewhere.
          const submitModifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
          if (submitModifier && event.key === 'Enter') {
            event.preventDefault()
            void postComment()
          }
        }}
        className="min-h-10 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!commentDraft.trim() || commentPosting}>
          {commentPosting ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : commentIsNote ? (
            translate('auto.components.odoo.ticket.workspace.log_note_button', 'Log note')
          ) : (
            translate('auto.components.odoo.ticket.workspace.send_message_button', 'Send message')
          )}
        </Button>
      </div>
    </form>
  )
}
