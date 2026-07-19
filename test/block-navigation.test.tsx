import test from 'ava'
import { act, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BlockNavigation, Link, Router, Routes } from '../src/index.tsx'
import { setup } from './helpers.ts'

const routes = [
  { path: '/', component: () => <div>Home</div> },
  { path: '/a', component: () => <div>Page A</div> },
  { path: '/b', component: () => <div>Page B</div> },
]

test.serial('native BlockNavigation confirms app-created navigation', (t) => {
  setup()

  const decisions = [false, true]
  const messages: string[] = []
  window.confirm = (message?: string) => {
    messages.push(message ?? '')
    return decisions.shift() ?? false
  }

  const root = ReactDOM.createRoot(document.getElementById('root')!)
  act(() => {
    root.render(
      <Router sync routes={routes}>
        <BlockNavigation message='Leave this form?' />
        <Link href='/a'>Go</Link>
        <Routes />
      </Router>,
    )
  })

  act(() => document.querySelector('a')!.click())
  t.is(location.pathname, '/')
  t.is(document.body.textContent, 'GoHome')

  act(() => document.querySelector('a')!.click())
  t.is(location.pathname, '/a')
  t.is(document.body.textContent, 'GoPage A')
  t.deepEqual(messages, ['Leave this form?', 'Leave this form?'])
})

test.serial('custom BlockNavigation keeps the first attempt and supports cancel and proceed', (t) => {
  setup()

  function App() {
    return (
      <Router sync routes={routes}>
        <BlockNavigation>
          {({ proceed, cancel }) => (
            <div role='dialog'>
              <button onClick={cancel}>Stay</button>
              <button onClick={proceed}>Discard</button>
            </div>
          )}
        </BlockNavigation>
        <Link href='/a'>A</Link>
        <Link href='/b'>B</Link>
        <Routes />
      </Router>
    )
  }

  act(() => ReactDOM.createRoot(document.getElementById('root')!).render(<App />))

  const [a, b] = document.querySelectorAll('a')
  act(() => a.click())
  t.truthy(document.querySelector('[role=dialog]'))
  t.is(location.pathname, '/')

  // A later attempt cannot replace the destination represented by the dialog.
  act(() => b.click())
  act(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'Discard')!
      .click(),
  )
  t.is(location.pathname, '/a')

  act(() => document.querySelectorAll('a')[1]!.click())
  act(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'Stay')!
      .click(),
  )
  t.is(location.pathname, '/a')
  t.falsy(document.querySelector('[role=dialog]'))
})

test.serial('unmounting a custom BlockNavigation cancels its pending attempt', (t) => {
  setup()

  function App() {
    const [guarded, setGuarded] = useState(true)
    return (
      <Router sync routes={routes}>
        {guarded && (
          <BlockNavigation>{() => <button onClick={() => setGuarded(false)}>Close guard</button>}</BlockNavigation>
        )}
        <Link href='/a'>A</Link>
        <Routes />
      </Router>
    )
  }

  act(() => ReactDOM.createRoot(document.getElementById('root')!).render(<App />))
  act(() => document.querySelector('a')!.click())
  act(() => document.querySelector('button')!.click())
  t.is(location.pathname, '/')

  act(() => document.querySelector('a')!.click())
  t.is(location.pathname, '/a')
})

test.serial('switching BlockNavigation modes cancels a pending custom attempt', (t) => {
  setup()
  window.confirm = () => true

  function App() {
    const [custom, setCustom] = useState(true)
    return (
      <Router sync routes={routes}>
        {custom ? (
          <BlockNavigation>{() => <button onClick={() => setCustom(false)}>Use native</button>}</BlockNavigation>
        ) : (
          <BlockNavigation />
        )}
        <Link href='/a'>A</Link>
        <Routes />
      </Router>
    )
  }

  act(() => ReactDOM.createRoot(document.getElementById('root')!).render(<App />))
  act(() => document.querySelector('a')!.click())
  act(() => document.querySelector('button')!.click())
  t.is(location.pathname, '/')

  act(() => document.querySelector('a')!.click())
  t.is(location.pathname, '/a')
})

test.serial('BlockNavigation guards beforeunload only while mounted', (t) => {
  setup()

  const root = ReactDOM.createRoot(document.getElementById('root')!)
  act(() => {
    root.render(
      <Router sync routes={routes}>
        <BlockNavigation />
      </Router>,
    )
  })

  const blocked = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(blocked)
  t.true(blocked.defaultPrevented)

  act(() => root.unmount())
  const allowed = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(allowed)
  t.false(allowed.defaultPrevented)
})

test.serial('custom BlockNavigation cancels and replays a cancelable traversal', (t) => {
  setup()

  const traversedKeys: string[] = []
  const navigation = new window.EventTarget() as EventTarget & {
    traverseTo(key: string): { finished: Promise<void> }
  }

  const navigateEvent = (key: string) => {
    const event = new window.Event('navigate', { cancelable: true })
    Object.assign(event, {
      navigationType: 'traverse',
      destination: { key, sameDocument: true, url: 'http://localhost/a' },
      hashChange: false,
    })
    return event
  }

  navigation.traverseTo = (key) => {
    traversedKeys.push(key)
    const replay = navigateEvent(key)
    t.true(navigation.dispatchEvent(replay))
    history.pushState({}, '', '/a')
    window.dispatchEvent(new window.PopStateEvent('popstate'))
    return { finished: Promise.resolve() }
  }
  Object.defineProperty(window, 'navigation', { configurable: true, value: navigation })

  act(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <Router sync routes={routes}>
        <BlockNavigation>{({ proceed }) => <button onClick={proceed}>Discard</button>}</BlockNavigation>
        <Routes />
      </Router>,
    )
  })

  const attempt = navigateEvent('entry-a')
  act(() => navigation.dispatchEvent(attempt))
  t.true(attempt.defaultPrevented)
  t.is(location.pathname, '/')
  t.is(document.querySelector('button')!.textContent, 'Discard')

  act(() => document.querySelector('button')!.click())
  t.deepEqual(traversedKeys, ['entry-a'])
  t.is(location.pathname, '/a')
  t.is(document.body.textContent, 'Page A')
})

test.serial('hash-mode traversal blocks route hashes but not ordinary fragments', (t) => {
  setup()

  const navigation = new window.EventTarget() as EventTarget & {
    traverseTo(key: string): { finished: Promise<void> }
  }
  navigation.traverseTo = () => ({ finished: Promise.resolve() })
  Object.defineProperty(window, 'navigation', { configurable: true, value: navigation })

  const navigateEvent = (url: string) => {
    const event = new window.Event('navigate', { cancelable: true })
    Object.assign(event, {
      navigationType: 'traverse',
      destination: { key: url, sameDocument: true, url },
      hashChange: true,
    })
    return event
  }

  act(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <Router sync mode='hash' routes={routes}>
        <BlockNavigation>{() => <div role='dialog'>Blocked</div>}</BlockNavigation>
        <Routes />
      </Router>,
    )
  })

  const fragment = navigateEvent('http://localhost/#section')
  act(() => navigation.dispatchEvent(fragment))
  t.false(fragment.defaultPrevented)
  t.falsy(document.querySelector('[role=dialog]'))

  const route = navigateEvent('http://localhost/#/a')
  act(() => navigation.dispatchEvent(route))
  t.true(route.defaultPrevented)
  t.is(document.querySelector('[role=dialog]')?.textContent, 'Blocked')
})
