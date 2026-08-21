// API-key rotation transport, split out of runtime-odoo-client.ts to keep that
// file under the max-lines budget; re-exported there so callers keep a single
// import path for every `odooX` fn.
import type { OdooInstance } from '../../../shared/odoo-types'
import { callRuntimeRpc, hasRuntimeRpcErrorCode } from './runtime-rpc-client'
import { getOdooRuntimeTarget, type RuntimeOdooSettings } from './odoo-runtime-target'
import type { OdooConnectResult } from './runtime-odoo-client'

/** The instance fields the update flow shows, and needs for the legacy-host fallback. */
export type OdooUpdatableInstance = Pick<OdooInstance, 'id' | 'serverUrl' | 'database' | 'login'>

export async function odooUpdateApiKey(
  settings: RuntimeOdooSettings,
  instance: OdooUpdatableInstance,
  apiKey: string
): Promise<OdooConnectResult> {
  const target = getOdooRuntimeTarget(settings)
  const args = { instanceId: instance.id, apiKey }
  if (target.kind !== 'environment') {
    return window.api.odoo.updateApiKey(args)
  }
  try {
    return await callRuntimeRpc<OdooConnectResult>(target, 'odoo.updateApiKey', args, {
      timeoutMs: 30_000
    })
  } catch (error) {
    if (!hasRuntimeRpcErrorCode(error, 'method_not_found')) {
      throw error
    }
    // Why: hosts predating `odoo.updateApiKey` still replace the key in place —
    // the instance id is derived from this same triple — so rotation keeps
    // working there. The cost is that `connect` also reselects the instance.
    return callRuntimeRpc<OdooConnectResult>(
      target,
      'odoo.connect',
      {
        serverUrl: instance.serverUrl,
        database: instance.database,
        login: instance.login,
        apiKey
      },
      { timeoutMs: 30_000 }
    )
  }
}
