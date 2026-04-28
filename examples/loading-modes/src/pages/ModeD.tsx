import React, { useEffect, useMemo, useState } from 'react'
import { Link, usePending, useRoute } from 'react-space-router'
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
 * Item-to-item clicks set a local "exiting" state before navigating, so the
 * currently committed detail fades out while the destination route suspends.
 * Because the detail read is not wrapped in an inner Suspense boundary, the
 * new detail only commits after its prepared data is ready.
 *
 * Leaving this route does not set that local state, so cross-page navigation
 * falls back to whatever the destination page opted into.
 */
export default function ModeD() {
  const route = useRoute()
  const pending = usePending()
  const currentId = String(route?.params?.id ?? ITEMS[0].id)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)

  useEffect(() => {
    setPendingItemId(null)
  }, [currentId])

  const currentItem = useMemo(() => ITEMS.find((item) => item.id === currentId) ?? ITEMS[0], [currentId])
  const isFading = pending && pendingItemId != null && pendingItemId !== currentId

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
        Recipe: item links set local exiting state before navigation. The detail read has no inner{' '}
        <code>&lt;Suspense&gt;</code>, so the router-level transition holds the old committed detail until the new one
        can render.
      </div>

      <div className='item-demo'>
        <aside className='item-list' aria-label='Items'>
          {ITEMS.map((item) => {
            const isCurrent = item.id === currentId
            const isRequested = item.id === pendingItemId

            return (
              <Link
                key={item.id}
                href={{
                  url: `/mode-d/${item.id}`,
                  current: isCurrent,
                  onClick: () => {
                    if (!isCurrent) setPendingItemId(item.id)
                  },
                }}
                className={() => `item-link${isRequested ? ' requested' : ''}`}
              >
                <strong>{item.name}</strong>
                <small>{item.meta}</small>
              </Link>
            )
          })}
        </aside>

        <section className={`item-detail${isFading ? ' is-fading' : ''}`} aria-live='polite'>
          <ItemDetail id={currentItem.id} name={currentItem.name} meta={currentItem.meta} />
        </section>
      </div>

      <p className='note'>
        Click between items, then try leaving for (a), (b), or (c). Only item-to-item navigation fades this detail
        surface; page-to-page navigation keeps the old page steady while the destination mode decides what loading UI
        appears.
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
