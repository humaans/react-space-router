import {
  createContext,
  forwardRef,
  lazy as reactLazy,
  Suspense,
  useCallback,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useTransition,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  createMatcher,
  createRouter,
  type Mode,
  type NavigationInfo,
  type NavigateTarget,
  type Qs,
  type Redirect,
  type Route,
  type RouteDefinition,
  type Router as SpaceRouter,
} from 'space-router'

export { qs } from 'space-router'
export type { Route } from 'space-router'

// ---------------------------------------------------------------------------
// Route preparation
// ---------------------------------------------------------------------------

export interface RoutePrepareContext {
  pathname: string
  url: string
  params: Record<string, string>
  query: Record<string, unknown>
}

/**
 * Lifecycle handle returned by data-layer `prepare()` calls (e.g. `figbird.prepare`).
 * The router pins the underlying cache entries via `release()` for the lifetime of
 * the navigation; superseded navigations release their handles immediately.
 */
export interface PreparedHandle {
  release(): void
}

/**
 * Synchronous navigation setup. Must not throw; asynchronous failures should
 * surface later through the data layer's Suspense read path.
 */
export type RoutePrepare = (ctx: RoutePrepareContext) => readonly PreparedHandle[] | PreparedHandle[] | void

/**
 * Speculative cache warming, the fire-and-forget sibling of `prepare`. Called
 * on link hover/visibility (see `<Link prefetch>`) and via `usePrefetch()`.
 * May be called repeatedly at any frequency — the data layer owns freshness
 * and lifecycle. The return value is ignored, so `(ctx) => [prefetch(a),
 * prefetch(b)]` reads the same as its `prepare` twin.
 */
export type RoutePrefetch = (ctx: RoutePrepareContext) => unknown

/**
 * A query to warm: a `[definition, args]` pair. Opaque to the router — it
 * flows straight through the `<Router data>` adapter. `args` is optional for
 * arg-less queries.
 */
export type QueryDescriptor = readonly [def: unknown, args?: unknown]

/**
 * Declares a route segment's data needs *once*, independent of lifecycle. The
 * router runs each descriptor through the `<Router data>` adapter — `prepare`
 * on navigation, `prefetch` on speculation — so a single declaration drives
 * both. Requires a `data` adapter; a `queries` route without one throws.
 */
export type RouteQueries = (ctx: RoutePrepareContext) => readonly QueryDescriptor[]

/**
 * Bridges route `queries` to a data layer, co-designed with figbird's kit the
 * same way `PreparedHandle` was: `prepare(def, args)` returns a pinnable handle
 * (caller-managed lease), `prefetch(def, args)` warms speculatively and its
 * return is ignored. figbird's `prepare`/`prefetch` satisfy this shape as-is —
 * `<Router data={{ prepare, prefetch }} />`.
 */
export interface DataAdapter {
  prepare(def: unknown, args: unknown): PreparedHandle
  prefetch(def: unknown, args: unknown): unknown
}

export type ResolverModule = { default: ComponentType<any> }

export type RouteResolver = () => Promise<ResolverModule>

export interface RouteData {
  path?: string
  redirect?: Redirect<RouteData>
  component?: ComponentType<any> | { default: ComponentType<any> } | null
  resolver?: RouteResolver
  prepare?: RoutePrepare
  prefetch?: RoutePrefetch
  queries?: RouteQueries
  // Set `false` to exclude a segment from speculative prefetch (no chunk
  // preload, no adapter `prefetch`) while still preparing it on real
  // navigation. A route veto — beats an explicit `<Link prefetch>`.
  prefetchable?: boolean
  props?: Record<string, unknown>
  scrollGroup?: string
  routes?: RouteData[]
  [extra: string]: unknown
}

// Resolver loads and their React.lazy wrappers are shared by resolver identity.
const resolverPromiseCache = new WeakMap<RouteResolver, Promise<ResolverModule>>()
const resolverComponentCache = new WeakMap<RouteResolver, ComponentType<any>>()
const resolverComponentEvictionPending = new WeakSet<RouteResolver>()

function preloadResolver(resolver: RouteResolver): Promise<ResolverModule> {
  let promise = resolverPromiseCache.get(resolver)
  if (!promise) {
    if (resolverComponentEvictionPending.delete(resolver)) {
      resolverComponentCache.delete(resolver)
    }
    promise = resolver()
    resolverPromiseCache.set(resolver, promise)
    promise.catch(() => {
      // React.lazy must retain this rejected wrapper long enough to throw into
      // the current error boundary. Mark it stale so the next navigation's
      // preload replaces it, rather than retrying during React's own render.
      if (resolverPromiseCache.get(resolver) === promise) {
        resolverPromiseCache.delete(resolver)
        resolverComponentEvictionPending.add(resolver)
      }
    })
  }
  return promise
}

function getResolverComponent(resolver: RouteResolver): ComponentType<any> {
  let component = resolverComponentCache.get(resolver)
  if (!component) {
    component = reactLazy(() => preloadResolver(resolver))
    resolverComponentCache.set(resolver, component)
  }
  return component
}

// ---------------------------------------------------------------------------
// Router context
// ---------------------------------------------------------------------------

// Navigation target, as accepted by `navigate()` and `<Navigate>`.
export type To = string | NavigateTarget

export interface TransformQueryContext {
  /** The target exactly as supplied by the app-facing navigation API. */
  to: To
  /** The latest route at the call site, or `null` before the first commit. */
  sourceRoute: Route<RouteData> | null
  /** The route matched before the query transform is applied. */
  targetRoute: Route<RouteData>
}

/**
 * Pure synchronous query mapping for app-created destinations. The returned
 * query is serialized with the Router's configured `qs` codec; `null` clears
 * it. Direct loads and browser traversal bypass this hook.
 */
export type TransformQuery = (
  query: Record<string, unknown>,
  context: TransformQueryContext,
) => Record<string, unknown> | null

// Prefetch trigger for links: `true` is shorthand for `'hover'` (delayed
// hover intent, immediate focus and touchstart), `'visible'` prefetches when
// the link scrolls into view. The trigger decides *when* to prefetch; the matched route's
// `prefetch`/`resolver` fields decide *what* — a link to a route that
// declares neither is a no-op.
export type PrefetchMode = boolean | 'hover' | 'visible'

function resolvePrefetchMode(value: PrefetchMode | undefined): 'hover' | 'visible' | null {
  if (value === true) return 'hover'
  if (value === 'hover' || value === 'visible') return value
  return null
}

// Link target: a navigation target plus the link-only `current` and
// `prefetch` overrides. Accepted by `useLinkProps()` and `<Link>`.
type LinkTarget = NavigateTarget & { current?: boolean; prefetch?: PrefetchMode }
export type LinkTo = string | LinkTarget

// The in-flight navigation, set at commit and cleared when the transition
// settles. `route` is post-transform (what `usePendingRoute()` returns);
// `matchedUrl` is the pre-transform URL links are written in, kept so
// `useLinkProps().isPending` can match against hrefs.
interface PendingNavigation {
  route: Route<RouteData>
  matchedUrl: string
}

interface RouterContextValue {
  router: SpaceRouter<RouteData>
  route: Route<RouteData> | null
  previousRoute: Route<RouteData> | null
  navigationSource: NavigationSource
  navigate: (to: To, currentRoute?: Route<RouteData> | null) => void
  isPending: boolean
  pending: PendingNavigation | null
  prefetchLinks: PrefetchMode | undefined
  prefetchHoverDelayMs: number
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined)

interface ResolvedTarget {
  /** Final browser-facing href after app-level target transforms. */
  href: string
  /** Normalized route-table URL, or `null` for targets outside the router. */
  routeUrl: string | null
  /** Whether navigation replaces the current history entry. */
  replace: boolean
  /** Committed route identity captured when the target was resolved. */
  sourceRoute: Route<RouteData> | null
}

interface RouterTargets {
  resolve: (to: To, sourceRoute?: Route<RouteData> | null) => ResolvedTarget
  navigate: (target: ResolvedTarget) => void
  prefetch: (target: ResolvedTarget) => void
}

const RouterTargetsContext = createContext<RouterTargets | undefined>(undefined)

function useRouterTargets(): RouterTargets {
  const targets = useContext(RouterTargetsContext)
  if (!targets) {
    throw new Error('Application must be wrapped in <Router />')
  }
  return targets
}

// ---------------------------------------------------------------------------
// Navigation blocking
// ---------------------------------------------------------------------------

export interface BlockNavigationControls {
  proceed(): void
  cancel(): void
}

interface NativeBlockNavigationProps {
  message?: string
  children?: never
}

interface CustomBlockNavigationProps {
  message?: never
  children: (controls: BlockNavigationControls) => ReactNode
}

export type BlockNavigationProps = NativeBlockNavigationProps | CustomBlockNavigationProps

interface BlockedAttempt {
  proceed(): void
}

interface RegisteredNavigationBlocker {
  request(attempt: BlockedAttempt): 'allow' | 'blocked'
  cancel(): void
}

interface BrowserNavigateEvent extends Event {
  navigationType: 'push' | 'replace' | 'reload' | 'traverse'
  destination: { key: string; sameDocument: boolean; url: string }
  hashChange: boolean
}

interface BrowserNavigation extends EventTarget {
  traverseTo(key: string): { finished: Promise<unknown> }
}

interface NavigationBlockerRegistry {
  register(blocker: RegisteredNavigationBlocker): () => void
  attemptAppNavigation(proceed: () => void): void
  dispose(): void
}

const NavigationBlockerContext = createContext<NavigationBlockerRegistry | undefined>(undefined)
const DEFAULT_BLOCK_NAVIGATION_MESSAGE = 'Discard unsaved changes?'

function browserNavigation(): BrowserNavigation | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { navigation?: BrowserNavigation }).navigation
}

function createNavigationBlockerRegistry(router: SpaceRouter<RouteData>): NavigationBlockerRegistry {
  const blockers: RegisteredNavigationBlocker[] = []
  let listening = false
  let traversalBypassKey: string | null = null

  const first = () => blockers[0]

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!first()) return
    event.preventDefault()
    event.returnValue = true
  }

  const onNavigate = (rawEvent: Event) => {
    const event = rawEvent as BrowserNavigateEvent
    if (
      event.navigationType !== 'traverse' ||
      !event.destination.sameDocument ||
      (event.hashChange && !isRouteHashDestination(event.destination.url, router))
    ) {
      return
    }

    const key = event.destination.key
    if (traversalBypassKey === key) {
      traversalBypassKey = null
      return
    }

    const blocker = first()
    if (!blocker) return

    // Browsers intentionally make some repeated/cross-origin traversals
    // non-cancelable. Let those proceed and clear any now-stale custom UI.
    if (!event.cancelable || !key) {
      blocker.cancel()
      return
    }

    const result = blocker.request({
      proceed() {
        const navigation = browserNavigation()
        if (!navigation) return

        traversalBypassKey = key
        try {
          void navigation.traverseTo(key).finished.catch(() => {
            if (traversalBypassKey === key) traversalBypassKey = null
          })
        } catch {
          traversalBypassKey = null
        }
      },
    })

    if (result === 'blocked') event.preventDefault()
  }

  const listen = () => {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('beforeunload', onBeforeUnload)
    browserNavigation()?.addEventListener('navigate', onNavigate)
  }

  const unlisten = () => {
    if (!listening || typeof window === 'undefined') return
    listening = false
    window.removeEventListener('beforeunload', onBeforeUnload)
    browserNavigation()?.removeEventListener('navigate', onNavigate)
    traversalBypassKey = null
  }

  return {
    register(blocker) {
      blockers.push(blocker)
      listen()

      return () => {
        const index = blockers.indexOf(blocker)
        if (index !== -1) blockers.splice(index, 1)
        if (blockers.length === 0) unlisten()
      }
    },
    attemptAppNavigation(proceed) {
      const blocker = first()
      if (!blocker || blocker.request({ proceed }) === 'allow') proceed()
    },
    dispose() {
      blockers.length = 0
      unlisten()
    },
  }
}

function isRouteHashDestination(url: string, router: SpaceRouter<RouteData>): boolean {
  try {
    const hash = new URL(url, window.location.href).hash
    // A hash-mode traversal to the root has no fragment. `#/` lets the core
    // apply the same route-vs-fragment rule used by links and navigation.
    return router.routeUrl(hash || '#/') !== null
  } catch {
    return false
  }
}

/**
 * Guards navigation while mounted. With no children it uses `window.confirm`;
 * render-function children are shown only after a navigation is blocked and
 * receive the one-shot `proceed` / `cancel` controls.
 */
export function BlockNavigation(props: BlockNavigationProps) {
  const registry = useContext(NavigationBlockerContext)
  if (!registry) {
    throw new Error('<BlockNavigation> must be rendered inside <Router />')
  }

  const render = 'children' in props ? props.children : undefined
  const message = 'message' in props ? (props.message ?? DEFAULT_BLOCK_NAVIGATION_MESSAGE) : undefined
  const custom = render !== undefined
  const config = useRef({ render, message })
  config.current = { render, message }

  const pendingRef = useRef<BlockedAttempt | null>(null)
  const [pending, setPending] = useState<BlockedAttempt | null>(null)
  const clearPending = useCallback(() => {
    pendingRef.current = null
    setPending(null)
  }, [])

  const blocker = useMemo<RegisteredNavigationBlocker>(
    () => ({
      request(attempt) {
        const current = config.current
        if (!current.render) {
          return window.confirm(current.message ?? DEFAULT_BLOCK_NAVIGATION_MESSAGE) ? 'allow' : 'blocked'
        }
        if (pendingRef.current) return 'blocked'

        pendingRef.current = attempt
        setPending(attempt)
        return 'blocked'
      },
      cancel: clearPending,
    }),
    [clearPending],
  )

  useLayoutEffect(() => {
    const unregister = registry.register(blocker)
    return () => {
      // Unmounting owns cancellation. No history action has happened yet.
      clearPending()
      unregister()
    }
  }, [registry, blocker, custom, clearPending])

  const controls = useMemo<BlockNavigationControls>(
    () => ({
      proceed() {
        const attempt = pendingRef.current
        if (!attempt) return
        clearPending()
        attempt.proceed()
      },
      cancel: clearPending,
    }),
    [clearPending],
  )

  return pending && render ? render(controls) : null
}

// Internal context for `<DelayedSuspense>`. `<Router>` updates it in the same
// transition as the destination route, so `holding` is true in the pending
// tree without changing already-committed fallbacks in the source tree.
const DelayedSuspenseContext = createContext<boolean>(false)

function useRouterCtx(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error('Application must be wrapped in <Router />')
  }
  return ctx
}

export function useSpaceRouter(): SpaceRouter<RouteData> {
  return useRouterCtx().router
}

/**
 * The current matched route. Throws when the current URL does not match the
 * router's route table; configure a wildcard route when unmatched URLs should
 * still render within the application.
 */
export function useRoute(): Route<RouteData> {
  const route = useRouterCtx().route
  if (!route) {
    throw new Error(
      "useRoute() requires a matched route. The current URL does not match <Router>'s route table; add a wildcard route if it should be handled.",
    )
  }
  return route
}

/**
 * The route immediately preceding the current successfully committed route,
 * or `null` on the initial route. Pending, suspended, superseded, and
 * unmatched destinations do not advance it. Same-URL commits do: route
 * identity, rather than URL equality, defines a new commit.
 */
export function usePreviousRoute(): Route<RouteData> | null {
  return useRouterCtx().previousRoute
}

/**
 * `true` while the router is between navigation start and commit. Backed by
 * React's `useTransition` — flips on as soon as `navigate()` runs and flips off
 * once the destination has committed (and any Suspense fallbacks at the new
 * route have resolved enough to let React's transition settle).
 *
 * Use this for top-of-page progress bars, desaturated link states, and "your
 * click did something" affordances. Don't use it for skeletons — those belong
 * in destination Suspense boundaries.
 */
export function usePending(): boolean {
  return useRouterCtx().isPending
}

/**
 * The route the router is currently transitioning toward, or `null` when
 * idle. Set for every navigation source — link clicks, programmatic
 * `navigate()`, browser back/forward — from commit until the transition
 * settles. Like `useRoute()`, the returned route is post-`transformRoute`.
 *
 * Use this for destination-aware pending UI: highlighting the requested
 * item in a list, fading the surface being replaced, or reading
 * `pendingRoute.params` without waiting for the commit.
 */
export function usePendingRoute(): Route<RouteData> | null {
  return useRouterCtx().pending?.route ?? null
}

export function useNavigate() {
  const { navigate, route } = useRouterCtx()
  const routeRef = useRef(route)
  useLayoutEffect(() => {
    routeRef.current = route
  }, [route])
  return useCallback((to: To) => navigate(to, routeRef.current), [navigate])
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

interface RouterOpts {
  mode: Mode | undefined
  qs: Qs | undefined
  sync: boolean | undefined
}

interface InternalRouter {
  router: SpaceRouter<RouteData>
  routerOpts: RouterOpts
}

type NavigationSource = 'navigation' | 'traversal'

interface OutstandingNavigation {
  targetUrl: string
  replace: boolean
  sourceRoute: Route<RouteData> | null
}

function makeRouter(routerOpts: RouterOpts): InternalRouter {
  const { mode, qs, sync } = routerOpts
  const router = createRouter<RouteData>({
    mode,
    qs,
    // React 19 flushes state updates scheduled during the popstate task
    // synchronously (to cooperate with the browser's scroll restoration) —
    // but a synchronous "transition" that suspends shows Suspense fallbacks
    // instead of holding the previous route, and pending state never paints.
    // Deliver traversal emits in a macrotask so back/forward gets the same
    // async transition semantics as link clicks. Space Router carries the
    // source metadata through to the surviving listener emission.
    schedule: (fire, { traversal }) => {
      if (sync) fire()
      else if (traversal) setTimeout(fire, 0)
      else queueMicrotask(fire)
    },
  })
  return { router, routerOpts }
}

interface TargetRouter {
  router: SpaceRouter<RouteData>
  navigate: (to: To, currentRoute?: Route<RouteData> | null) => void
  resolve: RouterTargets['resolve']
  navigateResolved: RouterTargets['navigate']
}

interface TargetRouterOptions {
  router: SpaceRouter<RouteData>
  currentRoute: Route<RouteData> | null
  committedRoute: RefObject<Route<RouteData> | null>
  transformQuery: TransformQuery | undefined
  matcher: ReturnType<typeof createMatcher<RouteData>>
  blockers: NavigationBlockerRegistry
}

// Owns app-created target resolution as one subsystem: route classification,
// query transformation, source capture, matching, navigation coalescing, and
// retry release. Browser/direct URLs never enter this path.
function useTargetRouter({
  router,
  currentRoute,
  committedRoute,
  transformQuery,
  matcher,
  blockers,
}: TargetRouterOptions): TargetRouter {
  const outstandingNavigation = useRef<OutstandingNavigation | null>(null)
  const transformQueryRef = useRef(transformQuery)
  transformQueryRef.current = transformQuery

  const matchTarget = useCallback((url: string) => matcher.match(url), [matcher])

  const resolveTarget = useCallback(
    (to: To, routeAtCallSite?: Route<RouteData> | null): ResolvedTarget => {
      const sourceRoute = routeAtCallSite === undefined ? committedRoute.current : routeAtCallSite
      // When the app has no current route, don't let the underlying router
      // infer a merge source independently from the URL.
      const hrefTarget = sourceRoute === null && typeof to !== 'string' && to.merge ? { ...to, merge: false } : to
      const initialHref = router.href(hrefTarget, sourceRoute ?? undefined)
      const routeUrl = router.routeUrl(initialHref)
      const replace = typeof to !== 'string' && to.replace === true
      const transform = transformQueryRef.current
      const targetRoute = routeUrl !== null && transform ? matchTarget(routeUrl) : undefined

      if (routeUrl === null || !transform || !targetRoute) {
        return {
          href: initialHref,
          routeUrl,
          replace,
          sourceRoute,
        }
      }

      const query = transform(targetRoute.query, { to, sourceRoute, targetRoute })
      const resolvedHref = router.href({
        pathname: targetRoute.pathname,
        query,
        hash: targetRoute.hash || null,
      })

      return {
        href: resolvedHref,
        routeUrl: router.routeUrl(resolvedHref),
        replace,
        sourceRoute,
      }
    },
    [router, matchTarget],
  )

  const navigateResolved = useCallback(
    (target: ResolvedTarget) => {
      const { href, replace, sourceRoute } = target
      const targetUrl = target.routeUrl ?? href
      const outstanding = outstandingNavigation.current

      // Coalesce only consecutive identical outstanding requests from the
      // same source route. An intervening target is distinct, and once a
      // route commits its new route object allows intentional same-URL navs.
      if (
        outstanding?.sourceRoute === sourceRoute &&
        outstanding.targetUrl === targetUrl &&
        outstanding.replace === replace
      ) {
        return
      }

      const intent = { targetUrl, replace, sourceRoute }
      const proceed = () => {
        outstandingNavigation.current = intent
        router.navigate({ url: href, replace })

        // Release the guard for unmatched/non-route targets after route
        // registration and scheduled emits have had a chance to run. This
        // keeps an unmatched target retryable.
        queueMicrotask(() => {
          if (outstandingNavigation.current !== intent || (target.routeUrl !== null && matchTarget(target.routeUrl))) {
            return
          }
          outstandingNavigation.current = null
        })
      }

      blockers.attemptAppNavigation(proceed)
    },
    [router, matchTarget, blockers],
  )

  const navigate = useCallback(
    (to: To, routeAtCallSite?: Route<RouteData> | null) => {
      navigateResolved(resolveTarget(to, routeAtCallSite))
    },
    [navigateResolved, resolveTarget],
  )

  const publicRouter = useMemo<SpaceRouter<RouteData>>(
    () => ({
      ...router,
      navigate(to, curr?: Route<RouteData>) {
        navigate(to, curr)
      },
      href(to, curr?: Route<RouteData>) {
        return resolveTarget(to, curr).href
      },
      match(url) {
        return matchTarget(url)
      },
    }),
    // A new wrapper makes consumers recompute hrefs when the application
    // replaces its transform, while the callbacks still read the latest ref.
    [router, navigate, resolveTarget, matchTarget, transformQuery],
  )

  useLayoutEffect(() => {
    if (currentRoute) outstandingNavigation.current = null
  }, [currentRoute])

  return useMemo(
    () => ({ router: publicRouter, navigate, resolve: resolveTarget, navigateResolved }),
    [publicRouter, navigate, resolveTarget, navigateResolved],
  )
}

/**
 * Pure synchronous route transform. Runs before navigation preparation and
 * speculative prefetching. Return a modified route to change what is prepared
 * or committed; returning `undefined` leaves it unchanged.
 */
export type TransformRoute = (route: Route<RouteData>) => Route<RouteData> | void

export interface RouterProps {
  /** The complete route table used for matching, preparation, and rendering. */
  routes: RouteDefinition<RouteData>[]
  mode?: Mode
  qs?: Qs
  sync?: boolean
  transformRoute?: TransformRoute
  /**
   * Pure synchronous query mapping for app-created destinations. Receives
   * the resolved target query plus the original intent, source route, and
   * initially matched target route. The returned query is serialized with
   * `qs`; `null` removes it. Direct loads and traversal bypass it.
   */
  transformQuery?: TransformQuery
  /**
   * Data adapter bridging route `queries` to a data layer. `prepare(def,
   * args)` returns a pinnable `PreparedHandle`, `prefetch(def, args)` warms
   * speculatively. figbird's kit satisfies this directly: `data={{ prepare,
   * prefetch }}`. Should be referentially stable (a module-level object or
   * the figbird instance). Required only if any route uses `queries`.
   */
  data?: DataAdapter
  /**
   * Default prefetch trigger for every link: `true` / `'hover'` prefetches on
   * hover, focus, and touchstart; `'visible'` when the link scrolls into
   * view. Individual links override with their own `prefetch`, including
   * `prefetch={false}` to opt out. Off by default.
   */
  prefetchLinks?: PrefetchMode
  /**
   * Hover-intent delay before a link prefetch starts. Leaving the link before
   * the delay expires cancels it; focus and touchstart remain immediate.
   * Default is `50` ms. Set to `0` for immediate hover prefetching.
   */
  prefetchHoverDelayMs?: number
  /**
   * How long to hold the previous route on screen before `<DelayedSuspense>`
   * boundaries fall back to their fallback content. Default is `1000` ms.
   * No effect on plain `<Suspense>` boundaries — those always show their
   * fallback the moment the boundary mounts.
   */
  pendingDelayMs?: number
  children?: ReactNode
}

const DEFAULT_PENDING_DELAY_MS = 1000
const DEFAULT_PREFETCH_HOVER_DELAY_MS = 50

interface RouteHistory {
  current: Route<RouteData> | null
  previous: Route<RouteData> | null
  navigationSource: NavigationSource
  resolved: boolean
}

export function Router({
  routes,
  mode,
  qs,
  sync,
  transformRoute,
  transformQuery,
  data,
  prefetchLinks,
  prefetchHoverDelayMs = DEFAULT_PREFETCH_HOVER_DELAY_MS,
  pendingDelayMs = DEFAULT_PENDING_DELAY_MS,
  children,
}: RouterProps) {
  const [{ router, routerOpts }, setRouter] = useState<InternalRouter>(() => makeRouter({ mode, qs, sync }))

  const [{ current: currRoute, previous: previousRoute, navigationSource, resolved }, setRouteHistory] =
    useState<RouteHistory>({
      current: null,
      previous: null,
      navigationSource: 'navigation',
      resolved: false,
    })
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const [isPending, startRouterTransition] = useTransition()

  // Preparation leases and render history advance only when React actually
  // commits a route. The separate committed-route ref is intentional: every
  // navigation started before the next layout commit must see the same source
  // route, so batched and superseded destinations never become `previous`.
  const committedRoute = useRef<Route<RouteData> | null>(null)
  const lastSuccessfulRoute = useRef<Route<RouteData> | null>(null)
  const committed = useRef<PreparedRoute | null>(null)
  const pendingPrepared = useRef<PreparedRoute | null>(null)
  const initialPrepared = useRef<InitialPreparedRoute | null>(null)
  const previousRoutes = useRef(routes)
  const hasResolvedRoute = useRef(false)

  // Hold generations are split across transition and urgent state so only
  // the destination render sees `holding=true`. The committed source tree
  // keeps its older render generation; this matters when it already has a
  // `<DelayedSuspense>` fallback on screen, which must remain visible while
  // the next route suspends.
  const nextHoldGeneration = useRef(0)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [renderHoldGeneration, setRenderHoldGeneration] = useState(0)
  const [releasedHoldGeneration, setReleasedHoldGeneration] = useState(0)
  const holding = renderHoldGeneration > releasedHoldGeneration

  const startHold = useCallback(() => {
    const generation = ++nextHoldGeneration.current
    if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      setReleasedHoldGeneration((released) => Math.max(released, generation))
    }, pendingDelayMs)
    return generation
  }, [pendingDelayMs])

  useEffect(() => {
    if (isPending) return
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setReleasedHoldGeneration((released) => Math.max(released, nextHoldGeneration.current))
  }, [isPending])

  useEffect(
    () => () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    },
    [],
  )

  // Keep the latest transform in a ref so router plumbing stays stable
  // without calling stale application code.
  const transformRef = useRef(transformRoute)
  transformRef.current = transformRoute

  const applyTransform = useCallback((next: Route<RouteData>) => {
    const transform = transformRef.current
    return transform ? (transform(next) ?? next) : next
  }, [])

  const matcher = useMemo(() => createMatcher(routes, { qs }), [routes, qs])
  const blockers = useMemo(() => createNavigationBlockerRegistry(router), [router])

  const targetRouter = useTargetRouter({
    router,
    currentRoute: currRoute,
    committedRoute,
    transformQuery,
    matcher,
    blockers,
  })

  const commit = useCallback(
    (prepared: PreparedRoute, source: NavigationSource = 'navigation') => {
      const { route: next, matched } = prepared
      const previous = lastSuccessfulRoute.current
      const holdGeneration = startHold()

      // The urgent set makes the pending navigation visible immediately;
      // the clear is deferred inside the transition so it only lands once
      // the destination has settled. Commit is the single owner of pending
      // state, which is why clicks, programmatic navigation, and browser
      // back/forward all register the same way.
      setPending({ route: next, matchedUrl: matched.url })
      startRouterTransition(() => {
        setRenderHoldGeneration(holdGeneration)
        setRouteHistory({ current: next, previous, navigationSource: source, resolved: true })
        setPending(null)
      })

      // Sync the address bar if the transform rewrote the URL. replaceUrl
      // is mode-aware and silent, so it can't re-trigger the router's
      // listener loop.
      if (next !== matched && next.url && next.url !== matched.url) {
        router.replaceUrl(next.url)
      }
    },
    [router, startHold],
  )

  // Begin a fresh navigation: release the superseded pending preparation,
  // prepare the transformed destination, and commit that exact prepared
  // object. URL identity is never used to transfer lease ownership.
  const beginNavigation = useCallback(
    (
      matched: Route<RouteData>,
      transformed: Route<RouteData> = applyTransform(matched),
      source: NavigationSource = 'navigation',
    ) => {
      const superseded = pendingPrepared.current
      pendingPrepared.current = null
      if (superseded) releaseHandles(superseded.handles)

      const prepared = { route: transformed, matched, handles: prepareRoute(transformed, data) }
      pendingPrepared.current = prepared
      commit(prepared, source)
    },
    [applyTransform, commit, data],
  )

  const beginUnmatched = useCallback(() => {
    const superseded = pendingPrepared.current
    pendingPrepared.current = null
    if (superseded) releaseHandles(superseded.handles)

    setPending(null)
    startRouterTransition(() => {
      setRouteHistory((history) =>
        history.resolved && history.current === null
          ? history
          : {
              current: null,
              previous: history.previous,
              navigationSource: history.navigationSource,
              resolved: true,
            },
      )
    })
  }, [])

  const releaseAll = useCallback(() => {
    const handles = new Set([
      ...(committed.current?.handles ?? []),
      ...(pendingPrepared.current?.handles ?? []),
      ...(initialPrepared.current?.prepared.handles ?? []),
    ])
    releaseHandles([...handles])
    committed.current = null
    pendingPrepared.current = null
    initialPrepared.current = null
  }, [])

  const initialRoute = useMemo<Pick<PreparedRoute, 'route' | 'matched'> | null>(() => {
    if (resolved) return null
    const matched = matcher.match(router.getUrl())
    return matched ? { route: applyTransform(matched), matched } : null
  }, [resolved, router, matcher, applyTransform])

  // Prepare the initial destination during render so its components can read
  // seeded data on their first render and code/data loading overlaps. The
  // effect below adopts these handles into the normal release lifecycle.
  if (initialRoute && !committed.current && initialPrepared.current?.prepared.route.url !== initialRoute.route.url) {
    initialPrepared.current = prepareInitialRoute(routes, initialRoute, data)
  }

  const activeRoute = resolved ? currRoute : (committed.current?.route ?? initialRoute?.route ?? null)

  // A rendered current route means the transition reached React's commit
  // path. Mark it during render so same-URL navigations started from child
  // layout effects are not mistaken for the router listener's initial emit.
  if (resolved) hasResolvedRoute.current = true

  useLayoutEffect(() => {
    committedRoute.current = currRoute
    if (currRoute) lastSuccessfulRoute.current = currRoute
  }, [currRoute])

  useEffect(() => {
    if (!initialRoute || currRoute || committed.current || pendingPrepared.current) return

    // StrictMode's mount -> cleanup -> remount cycle can consume and release
    // the render-prepared handles before this effect runs again. Re-prepare
    // when there is nothing left to adopt.
    const prepared =
      initialPrepared.current?.prepared.route.url === initialRoute.route.url
        ? claimInitialRoute(initialPrepared.current, initialRoute, data)
        : { ...initialRoute, handles: prepareRoute(initialRoute.route, data) }
    initialPrepared.current = null
    committed.current = prepared
  }, [initialRoute, currRoute, data])

  useEffect(() => {
    const transition = (matched: Route<RouteData> | undefined, info: NavigationInfo) => {
      if (!matched) {
        beginUnmatched()
        return
      }
      const source: NavigationSource = info.traversal ? 'traversal' : 'navigation'

      // Transform fresh on every navigation because application state may
      // change the result even when the matched URL is identical.
      const transformed = applyTransform(matched)

      // The listener's first emit adopts the preparation created during the
      // initial render. Every later same-URL emit is a real navigation.
      if (!hasResolvedRoute.current && committed.current?.route.url === transformed.url) {
        const superseded = pendingPrepared.current
        pendingPrepared.current = null
        if (superseded) releaseHandles(superseded.handles)
        commit(committed.current, source)
        return
      }

      beginNavigation(matched, transformed, source)
    }
    return router.listen(routes, transition)
  }, [router, routes, applyTransform, commit, beginNavigation, beginUnmatched])

  useEffect(() => {
    if (previousRoutes.current === routes) return
    previousRoutes.current = routes

    // History and hash listeners emit the current URL when they subscribe, so
    // their route-table update is already owned by the listener above. Memory
    // mode has no initial emit and therefore needs this explicit rematch.
    if ((routerOpts.mode ?? 'history') !== 'memory') return

    const currentUrl = currRoute?.url ?? committed.current?.route.url ?? router.getUrl()
    const matched = currentUrl ? matcher.match(currentUrl) : undefined
    if (matched) beginNavigation(matched)
    else beginUnmatched()
  }, [routes, router, routerOpts.mode, matcher, beginNavigation, beginUnmatched, currRoute?.url])

  useEffect(() => {
    const prepared = pendingPrepared.current
    if (!resolved) return

    if (!currRoute) {
      const previous = committed.current
      committed.current = null
      if (previous) releaseHandles(previous.handles)
      return
    }

    if (!prepared || prepared.route !== currRoute) return

    const previous = committed.current
    committed.current = prepared
    pendingPrepared.current = null
    if (previous) releaseHandles(previous.handles)
  }, [currRoute, resolved])

  useEffect(() => releaseAll, [releaseAll])
  useEffect(() => blockers.dispose, [blockers])

  const prefetchResolved = useCallback(
    (target: ResolvedTarget) => {
      const matched = target.routeUrl === null ? undefined : matcher.match(target.routeUrl)
      if (matched) prefetchRoute(applyTransform(matched), data)
    },
    [matcher, applyTransform, data],
  )

  const targets = useMemo<RouterTargets>(
    () => ({ resolve: targetRouter.resolve, navigate: targetRouter.navigateResolved, prefetch: prefetchResolved }),
    [targetRouter.resolve, targetRouter.navigateResolved, prefetchResolved],
  )

  const ctx = useMemo<RouterContextValue>(
    () => ({
      router: targetRouter.router,
      route: activeRoute,
      previousRoute,
      navigationSource,
      navigate: targetRouter.navigate,
      isPending,
      pending,
      prefetchLinks,
      prefetchHoverDelayMs,
    }),
    [
      targetRouter.router,
      targetRouter.navigate,
      activeRoute,
      previousRoute,
      navigationSource,
      isPending,
      pending,
      prefetchLinks,
      prefetchHoverDelayMs,
    ],
  )

  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={ctx}>
      <RouterTargetsContext.Provider value={targets}>
        <NavigationBlockerContext.Provider value={blockers}>
          <DelayedSuspenseContext.Provider value={holding}>{children}</DelayedSuspenseContext.Provider>
        </NavigationBlockerContext.Provider>
      </RouterTargetsContext.Provider>
    </RouterContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// DelayedSuspense
// ---------------------------------------------------------------------------

/**
 * A `<Suspense>` boundary whose fallback is *delayed* during an in-flight
 * router navigation: until the router has been pending for `pendingDelayMs`
 * (configured on `<Router>`, default 1000ms), the fallback re-throws so
 * suspension propagates upward — typically to the router-level transition,
 * which keeps the previous route on screen. Past the threshold (or when
 * the transition has already committed and a read is still pending), the
 * fallback renders normally.
 *
 * Use this when you want "stay on the previous page for a moment, then if
 * it's still loading degrade to a skeleton" — the classic browser-style
 * UX for variable-latency data. Outside an in-flight nav, behaves
 * identically to plain `<Suspense>`.
 */
export interface DelayedSuspenseProps {
  fallback: ReactNode
  children?: ReactNode
}

export function DelayedSuspense({ fallback, children }: DelayedSuspenseProps) {
  const holding = useContext(DelayedSuspenseContext)
  return <Suspense fallback={holding ? <DelayedSuspenseHold /> : fallback}>{children}</Suspense>
}

const NEVER_RESOLVES: Promise<never> = new Promise(() => {})

/**
 * Throws a never-resolving promise so the surrounding Suspense boundary's
 * fallback path itself suspends — the suspension bubbles up to the next
 * Suspense boundary above, which during a router transition is the
 * already-committed root holding the previous route.
 */
function DelayedSuspenseHold(): null {
  throw NEVER_RESOLVES
}

// ---------------------------------------------------------------------------
// Route preparation and rendering
// ---------------------------------------------------------------------------

export interface RoutesProps {
  disableScrollToTop?: boolean
}

interface PreparedRoute {
  route: Route<RouteData>
  matched: Route<RouteData>
  handles: PreparedHandle[]
}

interface InitialPreparedRoute {
  prepared: PreparedRoute
  routes: RouteDefinition<RouteData>[]
  data: DataAdapter | undefined
  claimed: boolean
}

// React 18 StrictMode throws away the hook state from its first development
// render, so a render-owned ref alone cannot carry the initial preparation
// handles into the second render. Keep an unclaimed preparation by stable
// route-table identity until a committed Router adopts it. Separate Router
// instances may render the same table; only the first claimant reuses the
// record and later claimants prepare their own leases.
const initialPreparationCache = new WeakMap<RouteDefinition<RouteData>[], InitialPreparedRoute[]>()

function prepareInitialRoute(
  routes: RouteDefinition<RouteData>[],
  initial: Pick<PreparedRoute, 'route' | 'matched'>,
  data: DataAdapter | undefined,
): InitialPreparedRoute {
  const cached = initialPreparationCache
    .get(routes)
    ?.find(
      (entry) =>
        !entry.claimed &&
        entry.data === data &&
        entry.prepared.matched.url === initial.matched.url &&
        samePreparationPlan(entry.prepared.route, initial.route),
    )
  if (cached) return cached

  const entry: InitialPreparedRoute = {
    prepared: { ...initial, handles: prepareRoute(initial.route, data) },
    routes,
    data,
    claimed: false,
  }
  const entries = initialPreparationCache.get(routes)
  if (entries) entries.push(entry)
  else initialPreparationCache.set(routes, [entry])
  return entry
}

function samePreparationPlan(a: Route<RouteData>, b: Route<RouteData>): boolean {
  return (
    a.url === b.url &&
    a.data.length === b.data.length &&
    a.data.every(
      (segment, index) =>
        segment.resolver === b.data[index].resolver &&
        segment.prepare === b.data[index].prepare &&
        segment.queries === b.data[index].queries,
    )
  )
}

function claimInitialRoute(
  entry: InitialPreparedRoute,
  initial: Pick<PreparedRoute, 'route' | 'matched'>,
  data: DataAdapter | undefined,
): PreparedRoute {
  if (entry.claimed) {
    return { ...initial, handles: prepareRoute(initial.route, data) }
  }

  entry.claimed = true
  const entries = initialPreparationCache.get(entry.routes)
  if (entries) {
    const remaining = entries.filter((candidate) => candidate !== entry)
    if (remaining.length) initialPreparationCache.set(entry.routes, remaining)
    else initialPreparationCache.delete(entry.routes)
  }
  return entry.prepared
}

function routePrepareContext(route: Route<RouteData>): RoutePrepareContext {
  return { pathname: route.pathname, url: route.url, params: route.params, query: route.query }
}

function requireAdapter(data: DataAdapter | undefined): DataAdapter {
  if (!data) {
    throw new Error(
      'A route declares `queries` but <Router> has no `data` adapter. Pass data={{ prepare, prefetch }} (e.g. from figbird).',
    )
  }
  return data
}

function prepareRoute(route: Route<RouteData>, data: DataAdapter | undefined): PreparedHandle[] {
  const ctx = routePrepareContext(route)
  const handles: PreparedHandle[] = []

  try {
    for (const segment of route.data) {
      if (segment.resolver) preloadResolver(segment.resolver)
      if (segment.prepare) {
        const result = segment.prepare(ctx)
        if (result) {
          handles.push(...result)
        }
      }
      if (segment.queries) {
        const adapter = requireAdapter(data)
        for (const [def, args] of segment.queries(ctx)) {
          handles.push(adapter.prepare(def, args))
        }
      }
    }
  } catch (error) {
    releaseHandles(handles)
    throw error
  }

  return handles
}

// Speculative twin of prepareRoute: same traversal, no lifecycle. `prefetch`
// return values are ignored by contract, adapter `prefetch` warms `queries`,
// and resolver chunk preloads are deduped by the resolver cache. A segment
// with `prefetchable: false` is skipped entirely — the route's veto over any
// speculation, however the trigger was set.
function prefetchRoute(route: Route<RouteData>, data: DataAdapter | undefined) {
  const ctx = routePrepareContext(route)
  for (const segment of route.data) {
    if (segment.prefetchable === false) continue
    if (segment.resolver) preloadResolver(segment.resolver)
    segment.prefetch?.(ctx)
    if (segment.queries) {
      const adapter = requireAdapter(data)
      for (const [def, args] of segment.queries(ctx)) {
        adapter.prefetch(def, args)
      }
    }
  }
}

function releaseHandles(handles: PreparedHandle[]) {
  for (const handle of handles) {
    try {
      handle.release()
    } catch {
      // best-effort
    }
  }
}

export function Routes({ disableScrollToTop }: RoutesProps) {
  const { route, navigationSource } = useRouterCtx()
  useScrollToTop(route, navigationSource, disableScrollToTop)

  return useMemo(() => {
    if (!route) return null

    // Each segment component receives only the params *declared in its own
    // `path`* — never borrowed from siblings or descendants. A wrapping
    // layout without a path gets no params; a layout that owns `:userId`
    // gets that one and only that one; the leaf gets whatever its own
    // path declared. Components type the params they expect via their own
    // function signature (e.g. `({ id }: { id: string })`); the router's
    // runtime injection meets them at that boundary.
    //
    // Static `props` declared on the route definition win on key collision
    // so consumers can intentionally override a path-injected param.
    return route.data.reduceRight<ReactNode>((children, segment) => {
      const Component = resolveSegmentComponent(segment)
      if (!Component) return children
      const ownParams = paramsDeclaredBy(segment.path, route.params)
      return (
        <Component {...ownParams} {...segment.props}>
          {children}
        </Component>
      )
    }, null)
  }, [route])
}

// Mirrors space-router's `:name` path param grammar. The modifier flags
// (`+*?`) that can follow a param don't affect name extraction.
const PATH_PARAM_NAME_RE = /:([A-Za-z0-9_]+)/g

/**
 * Picks out of `matched` only the params whose names appear as `:name`
 * segments in `path`. A layout segment with no path returns `{}`; a leaf
 * with `/users/:userId/posts/:postId` returns `{ userId, postId }`.
 */
function paramsDeclaredBy(path: string | undefined, matched: Record<string, string>): Record<string, string> {
  if (!path) return {}
  const own: Record<string, string> = {}
  for (const match of path.matchAll(PATH_PARAM_NAME_RE)) {
    const name = match[1]
    if (name in matched) own[name] = matched[name]
  }
  return own
}

function resolveSegmentComponent(segment: RouteData): ComponentType<any> | null {
  if (segment.resolver) {
    return getResolverComponent(segment.resolver)
  }
  const component = segment.component
  if (!component) return null
  return typeof component === 'function' ? component : component.default
}

function useScrollToTop(route: Route<RouteData> | null, navigationSource: NavigationSource, disabled?: boolean) {
  const prevScrollGroup = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!route || disabled) return

    const data = route.data[route.data.length - 1]
    const scrollGroup = data.scrollGroup || route.pathname
    const scrollGroupChanged = prevScrollGroup.current !== scrollGroup
    prevScrollGroup.current = scrollGroup

    if (navigationSource === 'traversal' || typeof window === 'undefined') return

    if (route.hash) {
      const encodedId = route.hash.replace(/^#/, '')
      let id = encodedId
      try {
        id = decodeURIComponent(encodedId)
      } catch {
        // Malformed escapes remain usable as literal element IDs.
      }

      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView()
        return
      }
      window.scrollTo(0, 0)
      return
    }

    if (scrollGroupChanged) {
      window.scrollTo(0, 0)
    }
  }, [route?.pathname, route?.hash, navigationSource, disabled])
}

// ---------------------------------------------------------------------------
// Link / Navigate
// ---------------------------------------------------------------------------

export function useMakeHref() {
  const { href } = useSpaceRouter()
  return href
}

function normalizeLinkTarget(to: LinkTo): LinkTarget {
  return typeof to === 'string' ? { url: to } : to
}

/**
 * Returns a function that warms a navigation target without navigating:
 * matches the URL, applies `transformRoute`, preloads matched `resolver`
 * chunks, and calls each matched segment's `prefetch(ctx)`. Fire-and-forget
 * and safe to call repeatedly — the data layer owns freshness. `<Link
 * prefetch>` uses this internally; call it directly for custom triggers
 * (form submit, viewport logic, "the user will need this next").
 */
export function usePrefetch(): (to: LinkTo) => void {
  const targets = useRouterTargets()
  const { route } = useRouterCtx()
  const routeRef = useRef(route)
  const prefetchResolved = usePrefetchResolved()
  useLayoutEffect(() => {
    routeRef.current = route
  }, [route])

  return useCallback(
    (to: LinkTo) => {
      prefetchResolved(targets.resolve(to, routeRef.current))
    },
    [targets, prefetchResolved],
  )
}

function usePrefetchResolved(): (target: ResolvedTarget) => void {
  return useRouterTargets().prefetch
}

export interface LinkPropsResult {
  href: string
  'aria-current': 'page' | undefined
  'data-pending': '' | undefined
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void
  // Present only when a prefetch trigger is active for this link.
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: () => void
  onTouchStart?: () => void
  ref?: (el: HTMLAnchorElement | null) => void
}

export interface LinkState {
  isCurrent: boolean
  isPending: boolean
}

// Shared target resolution for `useLinkProps` / `useLinkState`: normalize
// the target, build the href, and derive current/pending state against the
// router's committed and in-flight routes.
function useLinkTarget(to: LinkTo): LinkState & { target: LinkTarget; resolved: ResolvedTarget; href: string } {
  const target = normalizeLinkTarget(to)

  const { router, route: currRoute, pending } = useRouterCtx()
  const targets = useRouterTargets()

  const resolved = targets.resolve(to, currRoute)
  const { href, routeUrl: hrefUrl } = resolved
  const currentPathname = currRoute?.pathname ?? router.match(router.getUrl())?.pathname
  const isCurrent =
    typeof target.current === 'undefined'
      ? hrefUrl !== null && currentPathname === hrefUrl.split(/[?#]/)[0]
      : target.current
  const isPending =
    hrefUrl !== null && pending != null && (pending.matchedUrl === hrefUrl || pending.route.url === hrefUrl)

  return { target, resolved, href, isCurrent, isPending }
}

/**
 * Anchor props for a router-driven `<a>`: `{ href, aria-current, data-pending,
 * onClick }`. Everything returned is spreadable. Style current links with
 * `a[aria-current='page']` and pending links with `a[data-pending]` in CSS;
 * for programmatic reads use `useLinkState(to)`.
 */
export function useLinkProps(to: LinkTo): LinkPropsResult {
  const { target, resolved, href, isCurrent, isPending } = useLinkTarget(to)
  const { prefetchLinks, prefetchHoverDelayMs } = useRouterCtx()
  const targets = useRouterTargets()
  const prefetchResolved = usePrefetchResolved()
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved

  // Link-level `prefetch` overrides the Router-level `prefetchLinks` default.
  const prefetchMode = resolvePrefetchMode(target.prefetch ?? prefetchLinks)
  const visibleObserver = useRef<IntersectionObserver | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelHoverPrefetch = useCallback(() => {
    if (hoverTimer.current === null) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }, [])

  const prefetchImmediately = useCallback(() => {
    cancelHoverPrefetch()
    prefetchResolved(resolvedRef.current)
  }, [cancelHoverPrefetch, prefetchResolved])

  const scheduleHoverPrefetch = useCallback(() => {
    cancelHoverPrefetch()
    if (prefetchHoverDelayMs <= 0) {
      prefetchResolved(resolvedRef.current)
      return
    }
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null
      prefetchResolved(resolvedRef.current)
    }, prefetchHoverDelayMs)
  }, [cancelHoverPrefetch, prefetchHoverDelayMs, prefetchResolved])

  useLayoutEffect(() => cancelHoverPrefetch, [cancelHoverPrefetch, href, prefetchMode, prefetchHoverDelayMs])

  // `href` re-arms the one-shot observer when this link's destination changes.
  const observeVisible = useCallback(
    (el: HTMLAnchorElement | null) => {
      visibleObserver.current?.disconnect()
      visibleObserver.current = null

      if (!el || typeof IntersectionObserver === 'undefined') return

      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          if (visibleObserver.current === observer) visibleObserver.current = null
          prefetchResolved(resolvedRef.current)
        }
      })
      observer.observe(el)
      visibleObserver.current = observer
    },
    [prefetchResolved, href],
  )

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    cancelHoverPrefetch()
    if (shouldNavigate(event)) {
      event.preventDefault()
      targets.navigate(resolved)
    }
  }

  const result: LinkPropsResult = {
    href,
    'aria-current': isCurrent ? 'page' : undefined,
    'data-pending': isPending ? '' : undefined,
    onClick,
  }

  if (prefetchMode === 'hover') {
    result.onMouseEnter = scheduleHoverPrefetch
    result.onMouseLeave = cancelHoverPrefetch
    result.onFocus = prefetchImmediately
    result.onTouchStart = prefetchImmediately
  } else if (prefetchMode === 'visible') {
    result.ref = observeVisible
  }

  return result
}

/**
 * Per-target link state without the anchor props: `{ isCurrent, isPending }`.
 * Accepts the same target as `useLinkProps`, but works for any navigable UI,
 * not just anchors — tab strips, sidebar items, breadcrumb spinners.
 */
export function useLinkState(to: LinkTo): LinkState {
  const { isCurrent, isPending } = useLinkTarget(to)
  return { isCurrent, isPending }
}

export interface LinkOwnProps {
  href: LinkTo
  replace?: boolean
  current?: boolean
  prefetch?: PrefetchMode
  children?: ReactNode
}

export type LinkProps = LinkOwnProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkOwnProps>

// The user handler runs first; the router's prefetch trigger follows. There
// is no preventDefault-style opt-out here — prefetching is speculative and
// harmless, unlike onClick's navigation.
function composeTrigger<E>(
  user: ((event: E) => void) | undefined,
  trigger: (() => void) | undefined,
): ((event: E) => void) | undefined {
  if (!trigger) return user
  return (event: E) => {
    user?.(event)
    trigger()
  }
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    href: to,
    replace,
    current,
    prefetch,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onTouchStart,
    children,
    ...anchorProps
  },
  forwardedRef,
) {
  const linkTo: LinkTarget = typeof to === 'string' ? { url: to } : { ...to }
  if (replace !== undefined) linkTo.replace = replace
  if (current !== undefined) linkTo.current = current
  if (prefetch !== undefined) linkTo.prefetch = prefetch
  const linkProps = useLinkProps(linkTo)

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (onClick) onClick(event)
    linkProps.onClick(event)
  }

  const mergedRef = useCallback(
    (element: HTMLAnchorElement | null) => {
      linkProps.ref?.(element)
      if (typeof forwardedRef === 'function') forwardedRef(element)
      else if (forwardedRef) forwardedRef.current = element
    },
    [linkProps.ref, forwardedRef],
  )

  return (
    <a
      aria-current={linkProps['aria-current']}
      data-pending={linkProps['data-pending']}
      {...anchorProps}
      ref={mergedRef}
      href={linkProps.href}
      // eslint-disable-next-line react/jsx-handler-names
      onClick={handleClick}
      onMouseEnter={composeTrigger(onMouseEnter, linkProps.onMouseEnter)}
      onMouseLeave={composeTrigger(onMouseLeave, linkProps.onMouseLeave)}
      onFocus={composeTrigger(onFocus, linkProps.onFocus)}
      onTouchStart={composeTrigger(onTouchStart, linkProps.onTouchStart)}
    >
      {children}
    </a>
  )
})

export interface NavigateProps {
  to: To
}

export function Navigate({ to }: NavigateProps) {
  const targets = useRouterTargets()
  const { route } = useRouterCtx()
  const resolved = targets.resolve(to, route)

  useEffect(() => {
    targets.navigate(resolved)
  }, [resolved.href, resolved.replace, targets])

  return null
}

export function shouldNavigate(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0) return false
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return false
  const el = e.currentTarget as Element | null
  if (el && el.tagName === 'A') {
    const a = el as HTMLAnchorElement
    // let the browser handle these: opening in a new tab/window, downloads,
    // and cross-origin or non-http(s) protocols (mailto:, tel:, ...)
    if (a.target && a.target !== '_self') return false
    if (a.hasAttribute('download')) return false
    if (typeof window !== 'undefined' && a.origin && a.origin !== window.location.origin) return false
    if (
      typeof window !== 'undefined' &&
      a.hash &&
      a.origin === window.location.origin &&
      a.pathname === window.location.pathname &&
      a.search === window.location.search
    ) {
      return false
    }
  }
  return true
}
