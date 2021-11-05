/* eslint-disable react/jsx-no-bind */

import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import './styles.css'

import { Router, Routes, Link, Navigate, useRouter, useRoute, useLink, useNavigate } from '../..'

const routes = [
  {
    component: Chrome,
    a: 1,
    routes: [
      { path: '/', component: Home, b: 2 },
      { path: '/kitchen', component: Kitchen, c: 3 },
      { path: '/sink', component: Sink, d: 4 },
      { path: '/asink', resolver: async () => new Promise((resolve) => setTimeout(() => resolve(Asink), 1000)), e: 5 },
    ],
  },
]

function App() {
  return (
    <Router mode='hash'>
      <Routes routes={routes} />
    </Router>
  )
}

function Chrome({ children }) {
  return (
    <div>
      <nav>
        <Link href='#/'>Home</Link>
        <Link href='#/kitchen'>Kitchen</Link>
        <Link href='#/sink?pa=1&ra=2'>Sink</Link>
        <Link href='#/asink?hello=1'>Asink</Link>
      </nav>
      <div className='Chrome-container'>
        <div className='Chrome-content'>{children}</div>

        <Toys />
        <RouteDetails />
      </div>
    </div>
  )
}

function Home() {
  return <div>Home</div>
}

function Kitchen() {
  return <div>Kitchen</div>
}

function Sink() {
  return <div>Sink</div>
}

function Asink() {
  return <div>Asink resolves after 1 second</div>
}

function Toys() {
  const { pathname } = useRoute()
  const router = useRouter()
  const navigate = useNavigate()
  const linkProps = useLink({ query: { rnd: Math.random(Math.random() * 1000) }, merge: true })

  const [navigateWithComponent, setNavigateWithComponent] = useState()

  function delayedNavToKitchen() {
    navigate({ url: '/' })
  }

  function delayedHomeUsingRouter() {
    router.navigate({ url: '/' })
  }

  function navigateUsingNavigate() {
    setNavigateWithComponent(true)
  }

  function navigateWithMerge() {
    navigate({ pathname: '/', merge: true })
  }

  useEffect(() => {
    setNavigateWithComponent(false)
  }, [pathname])

  return (
    <div className='Toys'>
      <a {...linkProps}>Navigate to random query param</a>
      <button onClick={delayedNavToKitchen}>Navigate /home using useNavigate()</button>
      <button onClick={delayedHomeUsingRouter}>Navigate /home using useRouter()</button>
      <button onClick={navigateUsingNavigate}>Navigate /home using {`<Navigate />`} component</button>
      <button onClick={navigateWithMerge}>Navigate /home with merge: true</button>

      {navigateWithComponent && <Navigate to={{ pathname: '/' }} />}
    </div>
  )
}

function RouteDetails() {
  const route = useRoute()

  return <pre className='RouteDetails'>{JSON.stringify(route, null, 2)}</pre>
}

ReactDOM.render(<App />, document.querySelector('#root'))
