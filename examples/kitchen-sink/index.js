/* eslint-disable react/jsx-no-bind */

import React from 'react'
import ReactDOM from 'react-dom'
import './styles.css'

import { Router, Routes, Link, useRouter, useRoute, useLink, useNavigate } from '../../src'

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
        <Link href='#/asink'>Asink</Link>
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
  const router = useRouter()
  const navigate = useNavigate()
  const linkProps = useLink({ query: { rnd: Math.random(Math.random() * 1000) }, merge: true })

  function delayedNavToKitchen() {
    setTimeout(() => {
      navigate({ url: '/kitchen' })
    }, 1000)
  }

  function delayedHomeUsingRouter() {
    router.navigate({ url: '/' })
  }

  return (
    <div className='Toys'>
      <a {...linkProps}>Navigate to random query param</a>
      <button onClick={delayedNavToKitchen}>Navigate to Kitchen in 1s</button>
      <button onClick={delayedHomeUsingRouter}>Navigate Home using router</button>
    </div>
  )
}

function RouteDetails() {
  const route = useRoute()

  return <pre className='RouteDetails'>{JSON.stringify(route, null, 2)}</pre>
}

ReactDOM.render(<App />, document.querySelector('#root'))
