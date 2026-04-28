import React from 'react'
import { DelayedSuspense } from 'react-space-router'
import { read } from '../data'

/**
 * Mode (c): start as (b), fall back to (a) after a threshold.
 *
 * The whole pattern is just `<DelayedSuspense>` — a router-aware Suspense
 * boundary whose fallback is delayed until the in-flight nav has been
 * pending for `pendingDelayMs` (configured on `<Router>`, default 1000ms).
 *
 *   Pre-commit, under threshold: fallback re-throws → outer transition
 *                                holds the previous route.
 *   Past threshold or post-commit: fallback renders normally — skeleton.
 *
 * The phase tracking that this used to require in userspace (a Shell-level
 * provider, a `PassThrough` trick, careful handling of post-commit phase
 * reset) is encapsulated by the component. From here, the call site reads
 * exactly like a regular `<Suspense>`.
 */
export default function ModeC() {
  return (
    <>
      <div className='mode-header'>
        <h1>Mode (c) — Timed Fallback</h1>
        <p>
          Acts like (b) until the navigation has been pending for more than the threshold; then flips to (a) and
          commits with skeletons in place of any still-pending data.
        </p>
      </div>

      <div className='recipe'>
        Recipe: wrap each section in <code>&lt;DelayedSuspense fallback={'{<Skeleton/>}'}&gt;</code>. The router holds
        the previous route until <code>pendingDelayMs</code> (1000ms) has elapsed; past that, the boundaries fall
        back to skeletons.
      </div>

      <h2>Feed</h2>
      <DelayedSuspense fallback={<FeedSkeleton />}>
        <Reader name='feed' />
      </DelayedSuspense>

      <h2>Comments</h2>
      <DelayedSuspense fallback={<CommentsSkeleton />}>
        <Reader name='comments' />
      </DelayedSuspense>

      <h2>Related</h2>
      <DelayedSuspense fallback={<RelatedSkeleton />}>
        <Reader name='related' />
      </DelayedSuspense>

      <p className='note'>
        Threshold: 1000ms. If the slow read (6000ms) hasn't resolved by then, you'll see this last section commit
        with a skeleton in place of <strong>Related</strong>.
      </p>
    </>
  )
}

function Reader({ name }: { name: string }) {
  const v = read(name)
  return (
    <div className='card'>
      <p>{v.payload}</p>
      <p className='dim'>
        Resolved at <code>+{v.latency}ms</code>.
      </p>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className='card is-skeleton'>
      <span className='skel lg med' />
      <span className='skel short' />
    </div>
  )
}

function CommentsSkeleton() {
  return (
    <div className='card is-skeleton'>
      <span className='skel lg' />
      <span className='skel med' />
      <span className='skel short' />
    </div>
  )
}

function RelatedSkeleton() {
  return (
    <div className='card is-skeleton'>
      <span className='skel lg' />
      <span className='skel med' />
      <span className='skel short' />
    </div>
  )
}
