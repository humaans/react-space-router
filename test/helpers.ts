import { JSDOM, VirtualConsole } from 'jsdom'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

export const g = globalThis as any

export function setup() {
  const virtualConsole = new VirtualConsole()
  virtualConsole.forwardTo(console, { jsdomErrors: 'none' })
  virtualConsole.on('jsdomError', (error) => {
    if (error.type === 'not-implemented' && error.message === 'Not implemented: navigation to another Document') {
      return
    }
    if (error.type === 'unhandled-exception') {
      console.error(error.cause.stack)
      return
    }
    console.error(error.message)
  })

  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost/',
    virtualConsole,
  })
  g.window = dom.window
  g.window.scrollTo = () => {}
  g.document = dom.window.document
  g.history = {
    // Like the real pushState, this does NOT fire popstate — space-router
    // schedules its own emit after pushing. Tests that simulate back/forward
    // dispatch a PopStateEvent explicitly.
    pushState(_state: unknown, _title: string, url: string) {
      g.location.href = url
      g.location.pathname = url
    },
    replaceState() {
      // no-op for tests; real replaceState would update the address bar
    },
  }
  g.location = {
    href: '/',
    pathname: '/',
    search: '',
    hash: '',
  }
}

export function dispatchClick(el: Element): MouseEvent {
  const event = new window.MouseEvent('click', { bubbles: true, button: 0, cancelable: true })
  el.dispatchEvent(event)
  return event
}
