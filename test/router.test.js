import test from 'ava'
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { JSDOM } from 'jsdom'
import { Router, Routes, useRouter, qs } from '../src'

test.serial('usage', async function (t) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  global.window = dom.window
  global.window.scrollTo = () => {}
  global.document = dom.window.document
  global.history = {
    pushState(state, title, url) {
      global.location.href = url
      global.location.pathname = url

      const popstate = new dom.window.PopStateEvent('popstate')
      dom.window.dispatchEvent(popstate)
    },
  }
  global.location = {
    href: '/',
    pathname: '/',
    search: '',
  }
  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => <div>Hello</div>,
    },
    {
      path: '/stuff',
      component: () => <div>Stuff</div>,
    },
  ]

  let router

  function InitialNav() {
    const _router = useRouter()

    useEffect(() => {
      router = _router
    }, [])

    return null
  }

  function App() {
    return (
      <Router sync>
        <InitialNav />
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    ReactDOM.render(<App />, root)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Hello</div></div>')

  act(() => {
    router.navigate({ url: '/stuff' })
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Stuff</div></div>')
})

test('qs', async (t) => {
  t.is(qs.stringify({ a: 1 }), 'a=1')
  t.deepEqual(qs.parse('a=1'), { a: '1' })
})
