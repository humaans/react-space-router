import React, { Suspense } from 'react'
import { read } from '../data'

/**
 * Mode (a): commit immediately (well — once chunk is loaded), then render
 * the page shell with inner Suspense boundaries firing skeletons for any
 * data that is still pending.
 *
 * Where the Suspense boundaries are: wrapping each slow read individually
 * in this same file. That's the whole "configuration" — no router knob.
 */
export default function ModeA() {
  return (
    <>
      <div className='mode-header'>
        <h1>Mode (a) — Immediate + Skeletons</h1>
        <p>
          Page shell renders as soon as the chunk arrives. Each slow read has its own <code>&lt;Suspense&gt;</code>{' '}
          boundary, so skeletons fire while data is pending and swap to content as it arrives.
        </p>
      </div>

      <div className='recipe'>
        Recipe: <code>&lt;Suspense fallback={'{<Skel/>}'}&gt;</code> wraps each slow read. The page header and any
        already-resolved reads render immediately on commit.
      </div>

      <h2>User</h2>
      {/* Fast data (100ms) — usually resolved by the time we commit; renders inline. */}
      <Suspense fallback={<UserSkeleton />}>
        <UserCard />
      </Suspense>

      <h2>Posts</h2>
      {/* Medium (500ms) — likely pending on commit; skeleton fires. */}
      <Suspense fallback={<PostsSkeleton />}>
        <Posts />
      </Suspense>

      <h2>Analytics</h2>
      {/* Slow (3000ms) — definitely pending; skeleton fires longest. */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <Analytics />
      </Suspense>
    </>
  )
}

function UserCard() {
  const v = read('user')
  return (
    <div className='card'>
      <h3>{v.payload}</h3>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code> after navigation start.
      </p>
    </div>
  )
}

function Posts() {
  const v = read('posts')
  return (
    <div className='card'>
      <p>{v.payload}</p>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code>.
      </p>
    </div>
  )
}

function Analytics() {
  const v = read('analytics')
  return (
    <div className='card'>
      <p>{v.payload}</p>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code>.
      </p>
    </div>
  )
}

function UserSkeleton() {
  return (
    <div className='card is-skeleton'>
      <span className='skel lg med' />
      <span className='skel short' />
    </div>
  )
}

function PostsSkeleton() {
  return (
    <div className='card is-skeleton'>
      <span className='skel lg' />
      <span className='skel med' />
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className='card is-skeleton'>
      <span className='skel lg' />
      <span className='skel med' />
      <span className='skel short' />
    </div>
  )
}
