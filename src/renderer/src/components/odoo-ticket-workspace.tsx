import React, { useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { VisuallyHidden } from 'radix-ui'

import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import {
  odooAddTicketComment,
  odooListStages,
  odooTicketComments,
  odooUpdateTicket
} from '@/runtime/runtime-odoo-client'
import { translate } from '@/i18n/i18n'
import type {
  OdooComment,
  OdooPriority,
  OdooStage,
  OdooTicket,
  OdooTicketUpdate
} from '../../../shared/types'

type OdooTicketWorkspaceProps = {
  ticket: OdooTicket | null
  onClose: () => void
  onTicketPatched: (ticketId: number, patch: Partial<OdooTicket>) => void
}

function getPriorityOptions(): { id: OdooPriority; label: string }[] {
  return [
    { id: '0', label: translate('auto.components.odoo.ticket.workspace.4411a54695', 'Low') },
    { id: '1', label: translate('auto.components.odoo.ticket.workspace.bcaea799c1', 'Medium') },
    { id: '2', label: translate('auto.components.odoo.ticket.workspace.2f1f13a17c', 'High') },
    { id: '3', label: translate('auto.components.odoo.ticket.workspace.1000c20873', 'Urgent') }
  ]
}

function formatCommentDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export function OdooTicketWorkspace({
  ticket,
  onClose,
  onTicketPatched
}: OdooTicketWorkspaceProps): React.JSX.Element {
  return (
    <Sheet open={ticket !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <VisuallyHidden.Root>
          <SheetTitle>{ticket?.title ?? ''}</SheetTitle>
          <SheetDescription>{ticket?.ref ?? ''}</SheetDescription>
        </VisuallyHidden.Root>
        {ticket ? (
          // Keyed remount resets per-ticket state (draft, comments, stages)
          // without effect-driven state adjustments on prop changes.
          <OdooTicketDetail
            key={`${ticket.instanceId ?? ''}:${ticket.id}`}
            ticket={ticket}
            onTicketPatched={onTicketPatched}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function OdooTicketDetail({
  ticket,
  onTicketPatched
}: {
  ticket: OdooTicket
  onTicketPatched: (ticketId: number, patch: Partial<OdooTicket>) => void
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const patchOdooTicket = useAppStore((s) => s.patchOdooTicket)

  const [stages, setStages] = useState<OdooStage[]>([])
  const [comments, setComments] = useState<OdooComment[]>([])
  // Starts true: the keyed remount means this component always begins by
  // loading its ticket's comments, so no effect needs to flip it on.
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentPosting, setCommentPosting] = useState(false)
  const [saving, setSaving] = useState(false)

  const ticketId = ticket.id
  const projectId = ticket.project?.id ?? null
  const instanceId = ticket.instanceId ?? null

  // Depend on the runtime target's identity, not the whole settings object, so
  // unrelated settings writes don't refetch comments/stages while open.
  const runtimeContextKey = getProviderRuntimeContextKey(settings)
  useEffect(() => {
    let cancelled = false
    const activeSettings = useAppStore.getState().settings
    void odooTicketComments(activeSettings, ticketId, instanceId)
      .then((rows) => {
        if (!cancelled) {
          setComments(rows)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setCommentsLoading(false)
        }
      })
    if (projectId !== null) {
      void odooListStages(activeSettings, projectId, instanceId)
        .then((rows) => {
          if (!cancelled) {
            setStages(rows)
          }
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [ticketId, projectId, instanceId, runtimeContextKey])

  const applyUpdate = async (
    updates: OdooTicketUpdate,
    patch: Partial<OdooTicket>
  ): Promise<void> => {
    setSaving(true)
    try {
      const result = await odooUpdateTicket(settings, ticket.id, updates, ticket.instanceId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      patchOdooTicket(ticket.id, ticket.instanceId ?? null, patch)
      onTicketPatched(ticket.id, patch)
      toast.success(
        translate('auto.components.odoo.ticket.workspace.57e34ae785', 'Ticket updated.')
      )
    } catch {
      toast.error(
        translate(
          'auto.components.odoo.ticket.workspace.9311b4efd0',
          'Could not update the ticket.'
        )
      )
    } finally {
      setSaving(false)
    }
  }

  const postComment = async (): Promise<void> => {
    const body = commentDraft.trim()
    if (!body || commentPosting) {
      return
    }
    setCommentPosting(true)
    try {
      const result = await odooAddTicketComment(settings, ticket.id, body, ticket.instanceId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCommentDraft('')
      toast.success(
        translate('auto.components.odoo.ticket.workspace.8b2db83b43', 'Comment posted.')
      )
      const rows = await odooTicketComments(settings, ticket.id, ticket.instanceId)
      setComments(rows)
    } catch {
      toast.error(
        translate('auto.components.odoo.ticket.workspace.c243d3a215', 'Could not post the comment.')
      )
    } finally {
      setCommentPosting(false)
    }
  }

  return (
    <>
      <div className="flex flex-none flex-col gap-3 border-b border-border/50 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">
              {[ticket.ref, ticket.project?.name].filter(Boolean).join(' · ')}
            </div>
            <h2 className="mt-1 text-base font-semibold leading-snug text-foreground">
              {ticket.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => window.api.shell.openUrl(ticket.url)}
          >
            <ExternalLink className="size-3.5" />
            {translate('auto.components.odoo.ticket.workspace.2c5256318d', 'Open in Odoo')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {stages.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {translate('auto.components.odoo.ticket.workspace.8229d636d2', 'Stage')}
              </span>
              <Select
                value={ticket.stage ? String(ticket.stage.id) : undefined}
                disabled={saving}
                onValueChange={(value) => {
                  const stage = stages.find((entry) => String(entry.id) === value)
                  if (stage && stage.id !== ticket.stage?.id) {
                    void applyUpdate({ stageId: stage.id }, { stage })
                  }
                }}
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={String(stage.id)}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {translate('auto.components.odoo.ticket.workspace.9809e7ba90', 'Priority')}
            </span>
            <Select
              value={ticket.priority}
              disabled={saving}
              onValueChange={(value) => {
                const priority = value as OdooPriority
                if (priority !== ticket.priority) {
                  void applyUpdate({ priority }, { priority })
                }
              }}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getPriorityOptions().map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {ticket.assignees.length > 0 ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                {translate('auto.components.odoo.ticket.workspace.4f1a1c9e6c', 'Assignees')}
              </span>
              <span className="text-foreground">
                {ticket.assignees.map((user) => user.displayName).join(', ')}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-5 py-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {translate('auto.components.odoo.ticket.workspace.795c4960cb', 'Description')}
        </div>
        {ticket.description ? (
          <CommentMarkdown className="mt-2" content={ticket.description} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {translate('auto.components.odoo.ticket.workspace.425ca8bd04', 'No description')}
          </p>
        )}

        <div className="mt-6 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {translate('auto.components.odoo.ticket.workspace.c4a1981a5a', 'Comments')}
        </div>
        {commentsLoading ? (
          <div className="mt-3 flex justify-center py-4">
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {translate('auto.components.odoo.ticket.workspace.c87b4521ce', 'No comments yet')}
          </p>
        ) : (
          <div className="mt-2 space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-border/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {comment.author?.displayName ?? '—'}
                  </span>
                  <span>{formatCommentDate(comment.createdAt)}</span>
                </div>
                <CommentMarkdown className="mt-1.5" content={comment.body} />
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        className="flex flex-none flex-col gap-2 border-t border-border/50 px-5 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          void postComment()
        }}
      >
        <textarea
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.target.value)}
          placeholder={translate(
            'auto.components.odoo.ticket.workspace.1b5eaa43b5',
            'Add a comment…'
          )}
          rows={2}
          disabled={commentPosting}
          onKeyDown={(event) => {
            // Cross-platform submit: ⌘⏎ on Mac, Ctrl+Enter elsewhere.
            const submitModifier = navigator.userAgent.includes('Mac')
              ? event.metaKey
              : event.ctrlKey
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
            ) : (
              translate('auto.components.odoo.ticket.workspace.e74a44677f', 'Comment')
            )}
          </Button>
        </div>
      </form>
    </>
  )
}
