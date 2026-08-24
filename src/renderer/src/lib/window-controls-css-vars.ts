import {
  isPairedWebClientWindow,
  shouldRenderDesktopWindowChrome
} from '@/lib/desktop-window-chrome'

function resolveTitleBarPlatform(): NodeJS.Platform {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (userAgent.includes('Mac')) {
    return 'darwin'
  }
  return userAgent.includes('Windows') ? 'win32' : 'linux'
}

/** True when the renderer draws the window controls the OS would otherwise own. */
export const hasDesktopWindowControls = shouldRenderDesktopWindowChrome({
  platform: resolveTitleBarPlatform(),
  isWebClient: isPairedWebClientWindow()
})

/**
 * Publishes the overlay's metrics so any surface can clear it without hardcoding
 * 138px. Scoped to :root rather than .app-layout: portaled surfaces (sheets,
 * dialogs) render outside that subtree and would silently get the 0px default.
 * Called from the renderer bootstrap, like applyDocumentTheme.
 */
export function applyWindowControlsCssVars(): void {
  const root = document.documentElement
  root.style.setProperty('--window-controls-width', hasDesktopWindowControls ? '138px' : '0px')
  root.style.setProperty('--window-controls-height', hasDesktopWindowControls ? '36px' : '0px')
}
