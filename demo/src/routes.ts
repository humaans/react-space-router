import type { RouterProps } from 'react-space-router'
import { prepare, slowImport, type QueryDef } from './data'

// Latency budgets we'll reuse across routes. Tweak here to see the modes
// react. Reload the page to clear cache and re-feel cold loads.
export const LATENCIES = {
  fast: 100,
  medium: 500,
  detail: 1100,
  slow: 3000,
}

// A named query for a Mode D item detail. Declared once; the router runs it
// through the `<Router data>` adapter as prepare on navigation and as
// prefetch on link hover.
export const itemDetail: QueryDef<{ id: string }> = ({ id }) => ({ key: `item-${id}`, latency: LATENCIES.detail })

// Slow code chunk delay — meant to feel like a cold lazy import on a real
// network. Keeps the page held during chunk download regardless of mode.
const CHUNK_MS = 400

export const routes = [
  {
    path: '/',
    resolver: slowImport(0, () => import('./pages/Home')),
  },
  {
    path: '/mode-a',
    resolver: slowImport(CHUNK_MS, () => import('./pages/ModeA')),
    prepare: () => [
      // Mode A: prepare kicks off all data so reads in inner Suspense
      // boundaries can suspend on the same promises. Inner skeletons fire
      // for whichever data is still pending when the route commits.
      prepare('user', LATENCIES.fast),
      prepare('posts', LATENCIES.medium),
      prepare('analytics', LATENCIES.slow),
    ],
  },
  {
    path: '/mode-b',
    resolver: slowImport(CHUNK_MS, () => import('./pages/ModeB')),
    prepare: () => [
      // Mode B: same data, different page composition (no inner Suspense
      // boundaries → reads suspend at the outer boundary → transition
      // holds the previous route until everything is ready).
      prepare('user', LATENCIES.fast),
      prepare('bio', LATENCIES.medium),
      prepare('followers', LATENCIES.slow),
    ],
  },
  {
    path: '/mode-c',
    resolver: slowImport(CHUNK_MS, () => import('./pages/ModeC')),
    prepare: () => [
      prepare('feed', LATENCIES.fast),
      prepare('comments', LATENCIES.medium),
      prepare('related', LATENCIES.slow),
    ],
  },
  {
    path: '/mode-d/:id',
    resolver: slowImport(CHUNK_MS, () => import('./pages/ModeD')),
    // The router injects matching path params as props on the page
    // component. ModeD's signature declares `{ id?: string }`, so it
    // receives `id` for free — no `useRoute()` dance needed.
    //
    // `queries` declares the data need once; the `<Router data>` adapter runs
    // it as prepare on navigation and as prefetch when an item link is
    // hovered (see ModeD's <Link prefetch>). Compare Modes A–C, which call
    // the lower-level `prepare` field directly.
    queries: ({ params }) => [[itemDetail, { id: params.id }]],
    scrollGroup: 'mode-d',
  },
  {
    path: '/blocking',
    resolver: slowImport(0, () => import('./pages/Blocking')),
  },
] satisfies RouterProps['routes']
