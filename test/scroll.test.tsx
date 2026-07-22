// Window scroll policy: new navigations reset, while browser history
// traversals leave restoration to the user agent.
import test from 'ava'
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { Router, Routes, useNavigate } from '../src/index.tsx'
import { g, setup } from './helpers.ts'

test.serial('scrolls new destinations to top but does not override back/forward restoration', async (t) => {
  setup()

  const scrolls: Array<[number, number]> = []
  window.scrollTo = (x, y) => scrolls.push([x as number, y as number])

  let navigate: ReturnType<typeof useNavigate>

  function Controls() {
    navigate = useNavigate()
    return null
  }

  const routes = [
    { path: '/a', component: () => <div>A</div> },
    { path: '/b', component: () => <div>B</div> },
  ]

  g.location.href = '/a'
  g.location.pathname = '/a'

  const root = ReactDOM.createRoot(document.getElementById('root')!)
  await act(async () => {
    root.render(
      <Router routes={routes}>
        <Controls />
        <Routes />
      </Router>,
    )
  })

  // Ignore the initial direct-load reset; this assertion concerns subsequent
  // navigation sources.
  scrolls.length = 0

  await act(async () => navigate('/b'))
  t.deepEqual(scrolls, [[0, 0]])
  t.is(document.body.textContent, 'B')

  scrolls.length = 0
  await act(async () => {
    g.location.href = '/a'
    g.location.pathname = '/a'
    window.dispatchEvent(new window.PopStateEvent('popstate'))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  t.deepEqual(scrolls, [])
  t.is(document.body.textContent, 'A')

  // A later app-created navigation must not inherit the traversal source.
  await act(async () => navigate('/b'))
  t.deepEqual(scrolls, [[0, 0]])
})

test.serial('scrolls app navigation to a fragment and falls back to top when it is missing', async (t) => {
  setup()

  const scrolls: Array<[number, number]> = []
  const fragments: string[] = []
  window.scrollTo = (x, y) => scrolls.push([x as number, y as number])
  g.window.HTMLElement.prototype.scrollIntoView = function () {
    fragments.push(this.id)
  }

  let navigate: ReturnType<typeof useNavigate>

  function Controls() {
    navigate = useNavigate()
    return null
  }

  const routes = [
    { path: '/a', scrollGroup: 'docs', component: () => <div>A</div> },
    {
      path: '/b',
      scrollGroup: 'docs',
      component: () => <div id='install'>Install</div>,
    },
    { path: '/c', scrollGroup: 'docs', component: () => <div>C</div> },
  ]

  g.location.href = '/a'
  g.location.pathname = '/a'

  const root = ReactDOM.createRoot(document.getElementById('root')!)
  await act(async () => {
    root.render(
      <Router routes={routes}>
        <Controls />
        <Routes />
      </Router>,
    )
  })

  scrolls.length = 0

  await act(async () => navigate('/b#install'))
  t.deepEqual(fragments, ['install'])
  t.deepEqual(scrolls, [])

  await act(async () => navigate('/c#missing'))
  t.deepEqual(fragments, ['install'])
  t.deepEqual(scrolls, [[0, 0]])
})
