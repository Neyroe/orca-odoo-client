import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<() => string>()
}))

vi.mock('os', async () => {
  const actual = (await vi.importActual('os')) as Record<string, unknown>
  return {
    ...actual,
    homedir: homedirMock
  }
})

import { CommandCodeHookService } from './hook-service'
import { POSIX_ANCESTOR_ENVIRON_READ } from './command-code-managed-script'

const WINDOWS_POWERSHELL_LAUNCHER =
  /^[A-Za-z]:\/[^"]*\/System32\/WindowsPowerShell\/v1\.0\/powershell\.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand \S+$/

describe('CommandCodeHookService', () => {
  let homeDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'orca-command-code-home-'))
    homedirMock.mockReturnValue(homeDir)
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('installs the managed command for Command Code status events', () => {
    const status = new CommandCodeHookService().install()

    expect(status.state).toBe('installed')
    expect(status.managedHooksPresent).toBe(true)

    const config = JSON.parse(
      readFileSync(join(homeDir, '.commandcode', 'settings.json'), 'utf8')
    ) as {
      hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>
    }
    expect(Object.keys(config.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'Stop'].sort())
    expect(config.hooks.PreToolUse[0].matcher).toBe('.*')
    expect(config.hooks.PostToolUse[0].matcher).toBe('.*')
    expect(config.hooks.Stop[0].matcher).toBeUndefined()
    expect(config.hooks.PreToolUse[0].hooks[0].command).toMatch(
      process.platform === 'win32' ? WINDOWS_POWERSHELL_LAUNCHER : /command-code-hook/
    )
    if (process.platform !== 'win32') {
      expect(config.hooks.PreToolUse[0].hooks[0].command).toContain(join(homeDir, '.orca'))
    }
    if (process.platform !== 'win32') {
      expect(config.hooks.PreToolUse[0].hooks[0].command).toMatch(/^if \[ -f /)
    }
  })

  // Why: #6078 — a Windows user profile path with a space used to be written
  // verbatim as the hook command, so the agent split it at the space. The
  // managed command must use an encoded launcher so the path never appears raw
  // on the cmd.exe command line.
  it.skipIf(process.platform !== 'win32')(
    'wraps the managed hook command to survive spaces in the profile path (#6078)',
    () => {
      const spaceHome = join(tmpdir(), 'orca command-code home with spaces')
      mkdirSync(spaceHome, { recursive: true })
      homedirMock.mockReturnValue(spaceHome)
      try {
        expect(new CommandCodeHookService().install().state).toBe('installed')

        const config = JSON.parse(
          readFileSync(join(spaceHome, '.commandcode', 'settings.json'), 'utf8')
        ) as { hooks: Record<string, { hooks: { command: string }[] }[]> }

        const command = config.hooks.PreToolUse[0].hooks[0].command
        expect(command).toMatch(WINDOWS_POWERSHELL_LAUNCHER)
      } finally {
        rmSync(spaceHome, { recursive: true, force: true })
      }
    }
  )

  it('installs a hook script that can recover the endpoint when Command Code strips token env', () => {
    new CommandCodeHookService().install()

    const scriptFileName =
      process.platform === 'win32' ? 'command-code-hook.cmd' : 'command-code-hook.sh'
    const script = readFileSync(join(homeDir, '.orca', 'agent-hooks', scriptFileName), 'utf8')

    if (process.platform === 'win32') {
      expect(script).toContain('sourceEndpointByPort')
      expect(script).toContain('orca-dev\\agent-hooks')
      expect(script).toContain('set ORCA_AGENT_HOOK_PORT=')
    } else {
      expect(script).toContain('Command Code strips TOKEN-like env vars')
      expect(script).toContain('Command Code sanitizes hook subprocess env')
      expect(script).toContain('__orca_read_ancestor_var')
      expect(script).toContain('__orca_fill_from_endpoint_file')
      expect(script).toContain('[ "$__orca_endpoint_port" != "$ORCA_AGENT_HOOK_PORT" ]')
      expect(script).toContain('ORCA_PANE_KEY')
      expect(script).toContain('ORCA_AGENT_LAUNCH_TOKEN')
      expect(script).toContain('orca-dev/agent-hooks')
      expect(script).toContain('endpoint_port=')
      expect(script).toContain(POSIX_ANCESTOR_ENVIRON_READ)
    }
  })

  const itPosix = process.platform === 'win32' ? it.skip : it

  const runAncestorEnvironRead = (
    environPath: string,
    name: string
  ): Promise<{ code: number | null; stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', POSIX_ANCESTOR_ENVIRON_READ], {
        env: { ...process.env, __orca_environ_path: environPath, __orca_name: name },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
      child.on('error', reject)
      child.on('exit', (code) => resolve({ code, stdout, stderr }))
    })

  // Why (#32): the ancestor walk reaches environ paths it cannot open (ptrace_scope=1)
  // or that do not exist at all (no /proc on macOS). Both must stay silent, or the
  // shell diagnostic surfaces as hook stderr on every agent event.
  itPosix('recovers an ancestor variable without leaking a failed environ open', async () => {
    const environPath = join(homeDir, 'environ')
    writeFileSync(environPath, 'PATH=/usr/bin\0ORCA_PANE_KEY=tab:leaf\0TERM=xterm\0')

    const found = await runAncestorEnvironRead(environPath, 'ORCA_PANE_KEY')
    expect(found.stdout).toBe('tab:leaf\n')
    expect(found.stderr).toBe('')

    const unopenable = await runAncestorEnvironRead(
      join(homeDir, 'no-such-proc', '4242', 'environ'),
      'ORCA_PANE_KEY'
    )
    expect(unopenable.stderr).toBe('')
    expect(unopenable.stdout).toBe('')
    expect(unopenable.code).toBe(0)
  })

  itPosix('does not let stale endpoint files clobber recovered connection fields', async () => {
    new CommandCodeHookService().install()

    const staleEndpointPath = join(homeDir, 'stale-endpoint.env')
    writeFileSync(
      staleEndpointPath,
      [
        'ORCA_AGENT_HOOK_PORT=9',
        'ORCA_AGENT_HOOK_TOKEN=stale-token',
        'ORCA_AGENT_HOOK_ENV=development',
        'ORCA_AGENT_HOOK_VERSION=1',
        ''
      ].join('\n')
    )

    const requests: { body: string; token: string | string[] | undefined }[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        requests.push({ body, token: req.headers['x-orca-agent-hook-token'] })
        res.statusCode = 204
        res.end()
      })
    })

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address() as AddressInfo
      const scriptPath = join(homeDir, '.orca', 'agent-hooks', 'command-code-hook.sh')
      const child = spawn('/bin/sh', [scriptPath], {
        env: {
          ...process.env,
          HOME: homeDir,
          ORCA_AGENT_HOOK_ENDPOINT: staleEndpointPath,
          ORCA_AGENT_HOOK_PORT: String(address.port),
          ORCA_AGENT_HOOK_TOKEN: 'current-token',
          ORCA_PANE_KEY: 'tab:leaf',
          ORCA_TAB_ID: 'tab',
          ORCA_WORKTREE_ID: 'worktree',
          ORCA_AGENT_HOOK_ENV: 'development',
          ORCA_AGENT_HOOK_VERSION: '1'
        },
        stdio: ['pipe', 'ignore', 'pipe']
      })
      child.stdin.end(JSON.stringify({ hook_event_name: 'Stop' }))

      const { exitCode, stderr } = await new Promise<{
        exitCode: number | null
        stderr: string
      }>((resolve, reject) => {
        let stderr = ''
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        child.on('error', reject)
        child.on('exit', (exitCode) => resolve({ exitCode, stderr }))
      })

      expect(exitCode, `hook stderr: ${stderr}`).toBe(0)
      // Why (#32): fail on a leaked environ/redirect diagnostic, not on any host noise
      // the ancestor walk happens to pick up.
      expect(stderr).not.toMatch(/cannot open|Permission denied/)
      expect(requests).toHaveLength(1)
      expect(requests[0].token).toBe('current-token')
      expect(new URLSearchParams(requests[0].body).get('paneKey')).toBe('tab:leaf')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reports partial when one managed event is missing', () => {
    const service = new CommandCodeHookService()
    service.install()

    const configPath = join(homeDir, '.commandcode', 'settings.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      hooks: Record<string, unknown>
    }
    delete config.hooks.Stop
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

    const status = service.getStatus()

    expect(status.state).toBe('partial')
    expect(status.managedHooksPresent).toBe(true)
    expect(status.detail).toBe('Managed hook missing for events: Stop')
  })
})
