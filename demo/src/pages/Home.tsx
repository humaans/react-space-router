import React from 'react'

export default function Home() {
  return (
    <>
      <div className='mode-header'>
        <h1>Loading Modes Demo</h1>
        <p>
          Four pages. Same router, same data layer, same latency model. The first three differ only in where each page
          places its <code>&lt;Suspense&gt;</code> boundaries; the fourth adds a local same-surface fade.
        </p>
      </div>

      <p>
        Each route delays its code chunk by <strong>~400ms</strong> (simulating a cold lazy import) and prepares three
        data sources with different latencies:
      </p>

      <div className='card'>
        <div className='card-row'>
          <span>fast read</span>
          <span className='badge badge-fast'>100ms</span>
        </div>
        <div className='card-row'>
          <span>medium read</span>
          <span className='badge badge-slow'>500ms</span>
        </div>
        <div className='card-row'>
          <span>slow read</span>
          <span className='badge badge-very-slow'>3000ms</span>
        </div>
      </div>

      <h2>What to feel</h2>
      <p>
        Click between the three modes back-to-back. Watch the timer in the sidebar, the top-of-page progress bar, and
        whether you see <em>old content held</em>, <em>skeletons</em>, or some mix.
      </p>

      <div className='card'>
        <h3>(a) Immediate + skeletons</h3>
        <p className='dim'>
          Old page held while code chunk loads (~400ms), then new page commits with the fast data already there and
          skeletons in place of slow data. Skeletons swap to real content as data arrives.
        </p>
      </div>

      <div className='card'>
        <h3>(b) Wait for ready</h3>
        <p className='dim'>
          Old page held until <em>everything</em> is ready — chunk + all data — then a clean swap to the fully-loaded
          new page. No skeletons, no flicker. Slowest perceived "click → first new pixel," but no loading state to look
          at.
        </p>
      </div>

      <div className='card'>
        <h3>(c) Timed fallback</h3>
        <p className='dim'>
          Behaves like (b) for the first ~500ms, then falls back to (a) — meaning if the slow read is still pending
          after 500ms, we commit anyway and let inner skeletons take over. Best of both worlds for variable-latency
          data.
        </p>
      </div>

      <div className='card'>
        <h3>(d) Detail swap fade</h3>
        <p className='dim'>
          A detail page with an item list. Item-to-item clicks fade the currently rendered item while the next item
          loads, then swap only once the new item can render. Leaving the page does not trigger that local fade.
        </p>
      </div>

      <h2>How this is implemented</h2>
      <p>
        Same <code>&lt;Router&gt;</code>, same router code (every nav goes through <code>startTransition</code>), same{' '}
        <code>prepare()</code> shape. The three modes differ purely in <em>which Suspense primitive</em> wraps each
        read:
      </p>
      <ul>
        <li>
          <strong>(a)</strong> — wrap each slow read in <code>&lt;Suspense fallback={'{<Skeleton/>}'}&gt;</code>.
          Skeleton renders the moment the new tree commits.
        </li>
        <li>
          <strong>(b)</strong> — don't wrap at all. Reads suspend at the outer boundary; transition holds the previous
          route until everything resolves.
        </li>
        <li>
          <strong>(c)</strong> — wrap in <code>&lt;DelayedSuspense fallback={'{<Skeleton/>}'}&gt;</code>. Behaves like
          (b) for the first <code>pendingDelayMs</code> (500ms), then like (a).
        </li>
        <li>
          <strong>(d)</strong> — no inner boundary around the detail read. Same-page item links set a local fade state;
          the router transition keeps the old committed detail on screen until the next item is ready.
        </li>
      </ul>

      <p className='note'>
        Use <strong>Reset</strong> in the sidebar (or a hard reload) to clear the in-memory cache between attempts —
        otherwise the second visit to a route is instant.
      </p>
    </>
  )
}
