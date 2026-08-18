import { useEffect, useRef, useState } from 'react'

import { retainResolvableOdooProjectFilters } from '@/components/odoo-ticket-facets'
import { odooListProjects } from '@/runtime/runtime-odoo-client'
import { useAppStore } from '@/store'
import type { OdooInstanceSelection, OdooProject } from '../../../shared/odoo-types'

export type OdooProjectsState = {
  projects: OdooProject[]
  loading: boolean
  /**
   * A failed read is kept distinct from an empty one on purpose: the scope is
   * cleared only when the list really loaded, and doing it on a transient RPC
   * failure would silently widen a starred project view to everything.
   */
  failed: boolean
}

/**
 * The instance's projects, for the ticket toolbar's project selector — and the
 * reconciliation that keeps the selected scope consistent with them.
 *
 * Fetched eagerly rather than when the menu opens, unlike the stage-name popover:
 * a restored saved filter has to render its project's name in the trigger before
 * anyone touches the dropdown.
 */
export function useOdooProjects(args: {
  connected: boolean
  instanceId: OdooInstanceSelection | null
  /** The toolbar's current project selection, reconciled against the loaded list. */
  projectFilters: readonly string[]
  /** Called with the kept subset when some selected project no longer resolves. */
  onProjectFiltersResolved: (next: string[]) => void
}): OdooProjectsState {
  const { connected, instanceId, projectFilters, onProjectFiltersResolved } = args
  // Why the runtime id rather than the whole settings object: it is all
  // getOdooRuntimeTarget reads, and the object's identity changes on every
  // unrelated settings write — which would refetch the list each time.
  const runtimeEnvironmentId = useAppStore((s) => s.settings?.activeRuntimeEnvironmentId ?? null)
  const [projects, setProjects] = useState<OdooProject[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // Held in a ref so a fresh callback each render does not re-run the check.
  const onResolvedRef = useRef(onProjectFiltersResolved)
  useEffect(() => {
    onResolvedRef.current = onProjectFiltersResolved
  }, [onProjectFiltersResolved])

  useEffect(() => {
    if (!connected) {
      setProjects([])
      setFailed(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setFailed(false)
    void odooListProjects({ activeRuntimeEnvironmentId: runtimeEnvironmentId }, instanceId)
      .then((rows) => {
        if (!cancelled) {
          setProjects(rows)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([])
          setFailed(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [connected, instanceId, runtimeEnvironmentId])

  // A selection saved on another instance names project ids that mean nothing
  // here. Only the unresolvable entries are dropped; the rest of the selection
  // stands. Length is compared first — reporting an equal-but-new array every
  // render would set state in a loop.
  useEffect(() => {
    if (loading || failed || projects.length === 0) {
      return
    }
    const retained = retainResolvableOdooProjectFilters(projectFilters, projects)
    if (retained.length !== projectFilters.length) {
      onResolvedRef.current(retained)
    }
  }, [failed, loading, projectFilters, projects])

  return { projects, loading, failed }
}
