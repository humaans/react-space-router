import test from 'ava'
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { JSDOM } from 'jsdom'
import { Router, Routes, Link, Navigate, useInternalRouterInstance, useLinkProps, qs } from '../src/index.jsx'

global.IS_REACT_ACT_ENVIRONMENT = true

function setup() {
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
}

test.serial('usage', async function (t) {
  setup()

  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: Home },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  let router

  function Home() {
    return (
      <div>
        <Link to='/stuff'>Stuff</Link>Hello
      </div>
    )
  }

  function InitialNav() {
    const _router = useInternalRouterInstance()

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
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(
    window.document.body.innerHTML,
    '<div id="root"><div><a aria-current="page" to="/stuff" href="/">Stuff</a>Hello</div></div>'
  )

  act(() => {
    router.navigate('/stuff')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Stuff</div></div>')
})

test.serial('useLinkProps()', async function (t) {
  setup()

  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: () => <Navigate to='/stuff' /> },
    { path: '/stuff', component: Stuff },
  ]

  let linkProps

  function Stuff() {
    const _linkProps = useLinkProps('/stuff')
    useEffect(() => {
      linkProps = _linkProps
    }, [])

    return <div>Stuff</div>
  }

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.deepEqual(linkProps, {
    'aria-current': 'page',
    href: '/stuff',
    onClick: linkProps.onClick,
  })
  t.is(typeof linkProps.onClick, 'function')
})

test('qs', async (t) => {
  t.is(qs.stringify({ a: 1 }), 'a=1')
  t.deepEqual(qs.parse('a=1'), { a: '1' })
})
