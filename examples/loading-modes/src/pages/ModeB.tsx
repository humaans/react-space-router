import React from 'react'
import { read } from '../data'

/**
 * Mode (b): hold the previous route until *everything* is ready.
 *
 * Where the Suspense boundaries are: nowhere inside this page. Every read
 * suspends, and the only boundary that catches them is the outer one
 * (around <Routes /> in main.tsx). Inside a transition that boundary is
 * "already-committed showing previous content" → React holds. When the
 * last suspending read resolves, the entire new tree commits in one go.
 *
 * No skeletons. No flicker. Slowest "click → first new pixel" time.
 */
export default function ModeB() {
  return (
    <>
      <div className='mode-header'>
        <h1>Mode (b) — Wait for Ready</h1>
        <p>
          The previous page stays on screen until the chunk loads <em>and</em> all reads resolve. Then a single,
          flicker-free swap.
        </p>
      </div>

      <div className='recipe'>
        Recipe: no inner <code>&lt;Suspense&gt;</code> boundaries. Reads suspend at the outer router boundary;
        transition holds the previous route until everything is ready.
      </div>

      <h2>User</h2>
      <UserCard />

      <h2>Bio</h2>
      <Bio />

      <h2>Followers</h2>
      <Followers />

      <p className='note'>
        Notice: when this page finally appears, it's <strong>fully populated</strong> — no skeletons ever shown. The
        sidebar timer reflects the full wait.
      </p>
    </>
  )
}

function UserCard() {
  const v = read('user')
  return (
    <div className='card'>
      <h3>{v.payload}</h3>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code>.
      </p>
    </div>
  )
}

function Bio() {
  const v = read('bio')
  return (
    <div className='card'>
      <p>{v.payload}</p>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code>.
      </p>
    </div>
  )
}

function Followers() {
  const v = read('followers')
  return (
    <div className='card'>
      <p>{v.payload}</p>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code> — the longest of the three; this is the gate.
      </p>
    </div>
  )
}
