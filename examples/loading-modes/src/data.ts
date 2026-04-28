// A tiny suspense-aware data layer used to simulate prepared queries.
//
// Two surfaces:
//   prepare(key, ms) → returns a PreparedHandle for the router to await.
//   read(key)        → reads a previously-prepared value, suspends if pending.
//
// Cache lives in-module — refreshing the page resets it, exactly what the
// demo expects.

import type { PreparedHandle } from 'react-space-router'

type Value = {
  key: string
  fetchedAt: number
  latency: number
  payload: string
}

type Entry = { status: 'pending'; promise: Promise<void> } | { status: 'resolved'; value: Value }

const cache = new Map<string, Entry>()

const PAYLOADS: Record<string, string> = {
  user: 'Karolis Narkevicius — Founder',
  bio: 'Building Humaans, an HRIS for modern teams. Lives in London. Likes simple software.',
  posts: '12 posts, 4 drafts, last published 3 days ago',
  followers: '1,284 followers · 312 following',
  feed: 'Feed item: "What I learned building react-space-router 1.0"',
  comments: '8 new comments across 3 threads',
  analytics: '24,910 views this week · ↑ 14% week-over-week',
  related: 'You might also like: figbird, space-router, kinfolk',
}

export function clearCache() {
  cache.clear()
}

export function load(key: string, ms: number): Entry {
  let entry = cache.get(key)
  if (entry) return entry

  const promise = new Promise<void>((resolve) => {
    setTimeout(() => {
      cache.set(key, {
        status: 'resolved',
        value: {
          key,
          fetchedAt: Date.now(),
          latency: ms,
          payload: PAYLOADS[key] ?? `Payload for ${key}`,
        },
      })
      resolve()
    }, ms)
  })

  entry = { status: 'pending', promise }
  cache.set(key, entry)
  return entry
}

/** Suspense-aware read. Throws the promise if the data isn't ready. */
export function read(key: string): Value {
  const entry = cache.get(key)
  if (!entry) {
    throw new Error(`read("${key}") called before prepare/load — did you forget to prepare?`)
  }
  if (entry.status === 'pending') throw entry.promise
  return entry.value
}

/** Returns a PreparedHandle the router can pin while the route is committed. */
export function prepare(key: string, ms: number): PreparedHandle {
  const entry = load(key, ms)
  const promise = entry.status === 'pending' ? entry.promise : Promise.resolve()
  return {
    promise,
    release: () => {
      // Demo: keep entries around so revisits feel snappy. A real data layer
      // would refcount. Use a "Reset cache" button (or full reload) to clear.
    },
  }
}

/** "Slow chunk" simulator for lazy resolvers — wraps a real dynamic import in
 *  an artificial delay so we can demonstrate code-load behavior on a fast LAN. */
export function slowImport<T>(ms: number, factory: () => Promise<T>): () => Promise<T> {
  return () => new Promise((resolve) => setTimeout(resolve, ms)).then(factory)
}
