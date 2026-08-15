// A tiny suspense-aware data layer used to simulate prepared queries.
//
// Two surfaces:
//   prepare(key, ms) → starts the request and returns a release-only lease.
//   read(key)        → reads the prepared value, suspending on its promise.
//
// Cache lives in-module — refreshing the page resets it, exactly what the
// demo expects.

import type { DataAdapter, PreparedHandle } from 'react-space-router'

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
  'item-atlas': 'Atlas ships with enterprise SSO, lifecycle reporting, and role-based access controls.',
  'item-beacon': 'Beacon includes approvals, compensation bands, and policy acknowledgements.',
  'item-courier': 'Courier tracks async onboarding, probation milestones, and team introductions.',
  'item-delta': 'Delta monitors payroll checks, banking details, and month-end completion.',
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
  load(key, ms)
  return {
    release: () => {
      // Demo: keep entries around so revisits feel snappy. A real data layer
      // would refcount. Use a "Reset cache" button (or full reload) to clear.
    },
  }
}

/** Fire-and-forget warm — the speculative twin of prepare(). Idempotent
 *  (load() is cached), so it's safe to call on every hover. A real data layer
 *  (e.g. figbird) would also honour a staleTime here. */
export function prefetch(key: string, ms: number): void {
  load(key, ms)
}

/** "Slow chunk" simulator for lazy resolvers — wraps a real dynamic import in
 *  an artificial delay so we can demonstrate code-load behavior on a fast LAN. */
export function slowImport<T>(ms: number, factory: () => Promise<T>): () => Promise<T> {
  return () => new Promise((resolve) => setTimeout(resolve, ms)).then(factory)
}

// This demo represents one data-layer request as `[definition, args]`. The
// router treats that tuple as an opaque value; only this adapter understands
// its shape and invokes the definition.
export type QueryDef<A = unknown> = (args: A) => { key: string; latency: number }
type QueryRequest = readonly [def: QueryDef, args: unknown]

function resolveQuery(request: unknown) {
  const [def, args] = request as QueryRequest
  return def(args)
}

// The `<Router data>` adapter: bridges the demo's opaque query requests to its
// cache. A real data layer can use any request shape behind the same contract.
export const data = {
  prepare(request: unknown) {
    const { key, latency } = resolveQuery(request)
    return prepare(key, latency)
  },
  prefetch(request: unknown) {
    const { key, latency } = resolveQuery(request)
    prefetch(key, latency)
  },
} satisfies DataAdapter
