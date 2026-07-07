import React, { useMemo } from 'react'
import { Link, usePendingRoute } from 'react-space-router'
import { read } from '../data'

const ITEMS = [
  {
    id: 'atlas',
    name: 'Atlas',
    meta: 'Identity and permissions',
  },
  {
    id: 'beacon',
    name: 'Beacon',
    meta: 'Approvals and policy',
  },
  {
    id: 'courier',
    name: 'Courier',
    meta: 'Onboarding workflow',
  },
  {
    id: 'delta',
    name: 'Delta',
    meta: 'Payroll readiness',
  },
]

/**
 * Mode (d): a same-surface detail swap.
 *
 * `usePendingRoute()` exposes the route the router is transitioning toward,
 * so the requested item is derived straight from the router — no local
 * state, no click interception. The committed detail fades out while the
 * destination route suspends; because the detail read is not wrapped in an
 * inner Suspense boundary, the new detail only commits once its prepared
 * data is ready.
 *
 * Navigating to a different page changes the pending route's pattern, so
 * the fade stops and the destination page's own loading mode takes over.
 * Browser back/forward between items fades too — the router registers
 * history navigations the same way as clicks.
 */
// Path is `/mode-d/:id` — the router injects `id` as a prop, so the page
// component declares it directly instead of reaching for `useRoute()`.
export default function ModeD({ id = ITEMS[0].id }: { id?: string }) {
  const currentId = id

  const pendingRoute = usePendingRoute()
  const pendingItemId = pendingRoute?.pattern === '/mode-d/:id' ? pendingRoute.params.id : null
  const isFading = pendingItemId != null && pendingItemId !== currentId

  const currentItem = useMemo(() => ITEMS.find((item) => item.id === currentId) ?? ITEMS[0], [currentId])

  return (
    <>
      <div className='mode-header'>
        <h1>Mode (d) — Detail Swap Fade</h1>
        <p>
          Same page, different item: fade the old detail out, keep it mounted, then swap only when the next item is
          fully ready.
        </p>
      </div>

      <div className='recipe'>
        Recipe: derive the requested item from <code>usePendingRoute()</code>. The detail read has no inner{' '}
        <code>&lt;Suspense&gt;</code>, so the router-level transition holds the old committed detail until the new one
        can render.
      </div>

      <div className='item-demo'>
        <aside className='item-list' aria-label='Items'>
          {ITEMS.map((item) => (
            // The requested item lights up through the `data-pending`
            // attribute `<Link>` sets while its navigation is in flight —
            // styled in CSS via `.item-link[data-pending]`, no JS derivation.
            <Link
              key={item.id}
              href={{
                url: `/mode-d/${item.id}`,
                current: item.id === currentId,
              }}
              className='item-link'
            >
              <strong>{item.name}</strong>
              <small>{item.meta}</small>
            </Link>
          ))}
        </aside>

        <section className={`item-detail${isFading ? ' is-fading' : ''}`} aria-live='polite'>
          <ItemDetail id={currentItem.id} name={currentItem.name} meta={currentItem.meta} />
        </section>
      </div>

      <p className='note'>
        Click between items — browser back/forward fades too. Then try leaving for (a), (b), or (c): only item-to-item
        navigation fades this detail surface; page-to-page navigation keeps the old page steady while the destination
        mode decides what loading UI appears.
      </p>
    </>
  )
}

function ItemDetail({ id, name, meta }: { id: string; name: string; meta: string }) {
  const value = read(`item-${id}`)

  return (
    <div className='detail-card'>
      <div>
        <span className='detail-kicker'>{meta}</span>
        <h2>{name}</h2>
      </div>
      <p>{value.payload}</p>
      <dl className='detail-stats'>
        <div>
          <dt>Loaded</dt>
          <dd>
            <code>+{value.latency}ms</code>
          </dd>
        </div>
        <div>
          <dt>Cache key</dt>
          <dd>
            <code>{value.key}</code>
          </dd>
        </div>
      </dl>
    </div>
  )
}
