import {
  createContext,
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
} from 'react'
import {
  createMatcher,
  createRouter,
  type Mode,
  type NavigateTarget,
  type Qs,
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
  promise: Promise<unknown>
  release(): void
}

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

// Internal caches keyed by the resolver function reference. Generic params are
// erased here — the cache is structurally a map of unknown resolvers to their
// lazily-imported component types.
type AnyResolver = () => Promise<{ default: ComponentType<any> }>

const resolverPromiseCache = new WeakMap<AnyResolver, Promise<{ default: ComponentType<any> }>>()
const resolverComponentCache = new WeakMap<AnyResolver, ComponentType<any>>()

function preloadResolver(resolver: AnyResolver): Promise<{ default: ComponentType<any> }> {
  let promise = resolverPromiseCache.get(resolver)
  if (!promise) {
    promise = resolver()
    promise.catch(() => {
      // Keep the original rejected promise cached for React.lazy/error
      // boundaries, but mark preload rejections as observed.
    })
    resolverPromiseCache.set(resolver, promise)
  }
  return promise
}

function getResolverComponent(resolver: AnyResolver): ComponentType<any> {
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

// Prefetch trigger for links: `true` is shorthand for `'hover'` (hover,
// focus, and touchstart), `'visible'` prefetches when the link scrolls into
// view. The trigger decides *when* to prefetch; the matched route's
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
  navigate: (to: To, currentRoute?: Route<RouteData>) => void
  isPending: boolean
  pending: PendingNavigation | null
  qs: Qs | undefined
  prefetchLinks: PrefetchMode | undefined
}

export const RouterContext = createContext<RouterContextValue | undefined>(undefined)
const RouteContext = createContext<Route<RouteData> | null | undefined>(undefined)

// Plumbing between <Router> and <Routes>, kept out of the public RouterContext.
// The defaults let <Routes> render against a bare RouterContext (e.g. in
// renderToString tests) without a <Router> driving commits.
interface RouterInternals {
  transformRoute: (route: Route<RouteData>) => Route<RouteData>
  commit: (route: Route<RouteData>, matched?: Route<RouteData>) => void
  registerMatcher: (matcher: TargetMatcher) => void
  unregisterMatcher: (matcher: TargetMatcher) => void
  data: DataAdapter | undefined
}

const RouterInternalsContext = createContext<RouterInternals>({
  transformRoute: (route) => route,
  commit: () => {},
  registerMatcher: () => {},
  unregisterMatcher: () => {},
  data: undefined,
})

interface ResolvedTarget {
  href: string
  routeUrl: string | null
  navigationKey: string
  replace: boolean
  sourceRoute: Route<RouteData> | null
}

interface RouterTargets {
  resolve: (to: To, sourceRoute?: Route<RouteData> | null) => ResolvedTarget
  navigate: (target: ResolvedTarget) => void
  match: (url: string) => Route<RouteData> | undefined
}

const RouterTargetsContext = createContext<RouterTargets | undefined>(undefined)

function useRouterTargets(): RouterTargets {
  const targets = useContext(RouterTargetsContext)
  if (!targets) {
    throw new Error('Application must be wrapped in <Router />')
  }
  return targets
}

// Internal context for `<DelayedSuspense>`. Set by `<Router>` based on
// `usePending()` + a configurable threshold. `holding` is true only during
// the pre-commit window where we want the previous route to stay on screen.
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

export function useRoute(): Route<RouteData> | null {
  const ctx = useContext(RouterContext)
  const route = useContext(RouteContext)
  if (route !== undefined) return route
  if (!ctx) {
    throw new Error('Application must be wrapped in <Router />')
  }
  return ctx.route
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
  const { navigate } = useRouterCtx()
  const route = useRoute()
  const routeRef = useRef(route)
  useLayoutEffect(() => {
    routeRef.current = route
  }, [route])
  return useCallback((to: To) => navigate(to, routeRef.current ?? undefined), [navigate])
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

interface OutstandingNavigation {
  targetUrl: string
  replace: boolean
  sourceRoute: Route<RouteData> | null
}

interface TargetMatcher {
  match(url: string): Route<RouteData> | undefined
}

interface RouteHref {
  url: string
  prefix: '' | '#'
}

function normalizeRouteUrl(url: string): string {
  return url.replace(/^\/?#?\/?/, '/').replace(/\/$/, '') || '/'
}

function asRouteHref(href: string, mode: Mode | undefined): RouteHref | null {
  // Protocol and protocol-relative targets belong to the browser, not the
  // app's route table. This includes http(s), mailto, tel, and custom schemes.
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return null

  // In history/memory mode a leading hash is an in-page fragment. In hash
  // mode only `#/...` denotes a route; `#section` remains an in-page fragment.
  if (href.startsWith('#')) {
    if (mode !== 'hash' || !href.startsWith('#/')) return null
    return { url: normalizeRouteUrl(href.slice(1)), prefix: '#' }
  }

  return { url: normalizeRouteUrl(href), prefix: '' }
}

function makeRouter(routerOpts: RouterOpts): InternalRouter {
  const { mode, qs, sync } = routerOpts
  const router = createRouter<RouteData>({
    mode,
    qs,
    sync,
    // React 19 flushes state updates scheduled during the popstate task
    // synchronously (to cooperate with the browser's scroll restoration) —
    // but a synchronous "transition" that suspends shows Suspense fallbacks
    // instead of holding the previous route, and pending state never paints.
    // Deliver traversal emits in a macrotask so back/forward gets the same
    // async transition semantics as link clicks.
    schedule: sync ? undefined : (fire, { traversal }) => (traversal ? setTimeout(fire, 0) : queueMicrotask(fire)),
  })
  return { router, routerOpts }
}

interface TargetRouter {
  router: SpaceRouter<RouteData>
  navigate: (to: To, currentRoute?: Route<RouteData>) => void
  targets: RouterTargets
  registerMatcher: (matcher: TargetMatcher) => void
  unregisterMatcher: (matcher: TargetMatcher) => void
}

interface TargetRouterOptions {
  router: SpaceRouter<RouteData>
  mode: Mode | undefined
  currentRoute: Route<RouteData> | null
  transformQuery: TransformQuery | undefined
}

// Owns app-created target resolution as one subsystem: route classification,
// query transformation, source capture, matching, navigation coalescing, and
// retry release. Browser/direct URLs never enter this path.
function useTargetRouter({ router, mode, currentRoute, transformQuery }: TargetRouterOptions): TargetRouter {
  const committedRoute = useRef<Route<RouteData> | null>(null)
  const outstandingNavigation = useRef<OutstandingNavigation | null>(null)
  const targetMatcher = useRef<TargetMatcher | null>(null)
  const transformQueryRef = useRef(transformQuery)
  transformQueryRef.current = transformQuery

  const matchTarget = useCallback(
    (url: string) => {
      const matcher = targetMatcher.current
      return matcher ? matcher.match(url) : router.match(url)
    },
    [router],
  )

  const registerMatcher = useCallback((matcher: TargetMatcher) => {
    targetMatcher.current = matcher
  }, [])

  const unregisterMatcher = useCallback((matcher: TargetMatcher) => {
    if (targetMatcher.current === matcher) targetMatcher.current = null
  }, [])

  const resolveTarget = useCallback(
    (to: To, routeAtCallSite?: Route<RouteData> | null): ResolvedTarget => {
      const sourceRoute = routeAtCallSite ?? committedRoute.current
      const initialHref = router.href(to, sourceRoute ?? undefined)
      const routeHref = asRouteHref(initialHref, mode)
      const replace = typeof to !== 'string' && to.replace === true
      const transform = transformQueryRef.current
      const targetRoute = routeHref && transform ? matchTarget(routeHref.url) : undefined

      if (!routeHref || !transform || !targetRoute) {
        return {
          href: initialHref,
          routeUrl: routeHref?.url ?? null,
          navigationKey: routeHref?.url ?? initialHref,
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
      const href = `${routeHref.prefix}${resolvedHref}`
      const resolvedRouteHref = asRouteHref(href, mode)

      return {
        href,
        routeUrl: resolvedRouteHref?.url ?? null,
        navigationKey: resolvedRouteHref?.url ?? href,
        replace,
        sourceRoute,
      }
    },
    [router, mode, matchTarget],
  )

  const navigateResolved = useCallback(
    (target: ResolvedTarget) => {
      const { href, navigationKey: targetUrl, replace, sourceRoute } = target
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
      outstandingNavigation.current = intent
      router.navigate({ url: href, replace })

      // An unmatched or non-route target never reaches the route listener,
      // so release its guard after route registration and scheduled emits
      // have had a chance to run. This keeps it retryable.
      queueMicrotask(() => {
        if (outstandingNavigation.current !== intent || (target.routeUrl !== null && matchTarget(target.routeUrl))) {
          return
        }
        outstandingNavigation.current = null
      })
    },
    [router, matchTarget],
  )

  const navigate = useCallback(
    (to: To, routeAtCallSite?: Route<RouteData>) => {
      navigateResolved(resolveTarget(to, routeAtCallSite))
    },
    [navigateResolved, resolveTarget],
  )

  const publicRouter = useMemo<SpaceRouter<RouteData>>(
    () => ({
      ...router,
      navigate(to, curr) {
        navigate(to, curr)
      },
      href(to, curr) {
        return resolveTarget(to, curr).href
      },
    }),
    // A new wrapper makes consumers recompute hrefs when the application
    // replaces its transform, while the callbacks still read the latest ref.
    [router, navigate, resolveTarget, transformQuery],
  )

  const targets = useMemo<RouterTargets>(
    () => ({ resolve: resolveTarget, navigate: navigateResolved, match: matchTarget }),
    [resolveTarget, navigateResolved, matchTarget, transformQuery],
  )

  useLayoutEffect(() => {
    committedRoute.current = currentRoute
    if (currentRoute) outstandingNavigation.current = null
  }, [currentRoute])

  return useMemo(
    () => ({ router: publicRouter, navigate, targets, registerMatcher, unregisterMatcher }),
    [publicRouter, navigate, targets, registerMatcher, unregisterMatcher],
  )
}

/**
 * Pure synchronous route transform. Runs before navigation preparation and
 * speculative prefetching. Return a modified route to change what is prepared
 * or committed; returning `undefined` leaves it unchanged.
 */
export type TransformRoute = (route: Route<RouteData>) => Route<RouteData> | void

export interface RouterProps {
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
   * How long to hold the previous route on screen before `<DelayedSuspense>`
   * boundaries fall back to their fallback content. Default is `1000` ms.
   * No effect on plain `<Suspense>` boundaries — those always show their
   * fallback the moment the boundary mounts.
   */
  pendingDelayMs?: number
  children?: ReactNode
}

const DEFAULT_PENDING_DELAY_MS = 1000

export function Router({
  mode,
  qs,
  sync,
  transformRoute,
  transformQuery,
  data,
  prefetchLinks,
  pendingDelayMs = DEFAULT_PENDING_DELAY_MS,
  children,
}: RouterProps) {
  const [{ router, routerOpts }, setRouter] = useState<InternalRouter>(() => makeRouter({ mode, qs, sync }))

  const [currRoute, setCurrRoute] = useState<Route<RouteData> | null>(null)
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const [isPending, startRouterTransition] = useTransition()

  // `holding` is true during the pre-commit window where `<DelayedSuspense>`
  // boundaries should re-throw their fallback (so the previous route stays
  // committed). It flips off either after `pendingDelayMs` elapses while
  // still pending, or when the transition settles — whichever comes first.
  const [holding, setHolding] = useState(false)
  useEffect(() => {
    if (!isPending) {
      setHolding(false)
      return
    }
    setHolding(true)
    const t = setTimeout(() => setHolding(false), pendingDelayMs)
    return () => clearTimeout(t)
  }, [isPending, pendingDelayMs])

  // Keep the latest transform in a ref so router plumbing stays stable
  // without calling stale application code.
  const transformRef = useRef(transformRoute)
  transformRef.current = transformRoute

  const applyTransform = useCallback((next: Route<RouteData>) => {
    const transform = transformRef.current
    return transform ? (transform(next) ?? next) : next
  }, [])

  const targetRouter = useTargetRouter({
    router,
    mode: routerOpts.mode,
    currentRoute: currRoute,
    transformQuery,
  })

  const commit = useCallback(
    (next: Route<RouteData>, matched: Route<RouteData> = next) => {
      // The urgent set makes the pending navigation visible immediately;
      // the clear is deferred inside the transition so it only lands once
      // the destination has settled. Commit is the single owner of pending
      // state, which is why clicks, programmatic navigation, and browser
      // back/forward all register the same way.
      setPending({ route: next, matchedUrl: matched.url })
      startRouterTransition(() => {
        setCurrRoute(next)
        setPending(null)
      })

      // Sync the address bar if the transform rewrote the URL. replaceUrl
      // is mode-aware and silent, so it can't re-trigger the router's
      // listener loop.
      if (next !== matched && next.url && next.url !== matched.url) {
        router.replaceUrl(next.url)
      }
    },
    [router],
  )

  const ctx = useMemo<RouterContextValue>(
    () => ({
      router: targetRouter.router,
      route: currRoute,
      navigate: targetRouter.navigate,
      isPending,
      pending,
      qs,
      prefetchLinks,
    }),
    [targetRouter.router, targetRouter.navigate, currRoute, isPending, pending, qs, prefetchLinks],
  )

  const internals = useMemo<RouterInternals>(
    () => ({
      transformRoute: applyTransform,
      commit,
      registerMatcher: targetRouter.registerMatcher,
      unregisterMatcher: targetRouter.unregisterMatcher,
      data,
    }),
    [applyTransform, commit, targetRouter.registerMatcher, targetRouter.unregisterMatcher, data],
  )

  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={ctx}>
      <RouterTargetsContext.Provider value={targetRouter.targets}>
        <RouterInternalsContext.Provider value={internals}>
          <DelayedSuspenseContext.Provider value={holding}>{children}</DelayedSuspenseContext.Provider>
        </RouterInternalsContext.Provider>
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
// Routes
// ---------------------------------------------------------------------------

export interface RoutesProps {
  routes: RouteDefinition<RouteData>[]
  disableScrollToTop?: boolean
}

interface PreparedRoute {
  route: Route<RouteData>
  matched: Route<RouteData>
  handles: PreparedHandle[]
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

export function Routes({ routes, disableScrollToTop }: RoutesProps) {
  const { router, route, qs } = useRouterCtx()
  const { transformRoute, commit, registerMatcher, unregisterMatcher, data } = useContext(RouterInternalsContext)

  // Pinned prepare handles for the currently committed navigation. Released
  // when a new navigation commits or when <Routes> unmounts.
  const committed = useRef<PreparedRoute | null>(null)
  const pending = useRef<PreparedRoute | null>(null)
  const previousRoutes = useRef(routes)
  const hasCurrentRoute = useRef(route != null)
  const matcher = useMemo(() => createMatcher(routes, { qs }), [routes, qs])

  // Target-building APIs need route data before navigation, including while
  // route components are rendering their links. Register synchronously; the
  // identity-checked cleanup cannot clear a newer route map.
  registerMatcher(matcher)
  useEffect(() => () => unregisterMatcher(matcher), [matcher, unregisterMatcher])

  // Route state never returns to null during this Router's lifetime. Mark it
  // during render so a same-URL navigation from a newly committed route's
  // layout effects is not mistaken for the listener's initial emit.
  if (route) hasCurrentRoute.current = true

  const releaseAll = useCallback(() => {
    const handles = new Set([...(committed.current?.handles ?? []), ...(pending.current?.handles ?? [])])
    releaseHandles([...handles])
    committed.current = null
    pending.current = null
  }, [])

  const initialRoute = useMemo<Pick<PreparedRoute, 'route' | 'matched'> | null>(() => {
    if (route) return null
    const matched = matcher.match(router.getUrl())
    if (matched) {
      return {
        route: transformRoute(matched),
        matched,
      }
    }
    return null
  }, [route, router, matcher, transformRoute])

  // Kick off the initial route's prepare during the first render, before the
  // segment components below render and read from the data cache. An effect
  // can't do this: when the initial render suspends (e.g. on a cold lazy
  // chunk), React defers all effects inside the suspended boundary until the
  // content commits — by which point the components have already rendered
  // against an unseeded cache. Preparing here also lets chunk download and
  // data loading overlap on direct loads, same as on navigations. The
  // sanctioned lazy ref init keeps this idempotent across StrictMode's
  // double render; the initial-commit effect below adopts the handles into
  // the normal release lifecycle. If the render is discarded before any
  // effect runs (e.g. renderToString), the handles are never released.
  const initialPrepared = useRef<PreparedRoute | null>(null)
  if (initialRoute && !committed.current && initialPrepared.current?.route.url !== initialRoute.route.url) {
    initialPrepared.current = { ...initialRoute, handles: prepareRoute(initialRoute.route, data) }
  }

  const activeRoute = route ?? committed.current?.route ?? initialRoute?.route ?? null

  useEffect(() => {
    if (!initialRoute || route || committed.current || pending.current) return

    // Usually the render phase prepared this exact route and we adopt its
    // handles. The fallback is reachable, not dead: under StrictMode's
    // mount→cleanup→remount cycle the first mount adopts the handles and
    // nulls the ref, the cleanup releases them via releaseAll, and this
    // effect then runs again with the same closure — the route must be
    // re-prepared because the original handles were already released.
    const prepared =
      initialPrepared.current?.route.url === initialRoute.route.url
        ? initialPrepared.current
        : { ...initialRoute, handles: prepareRoute(initialRoute.route, data) }
    initialPrepared.current = null
    committed.current = prepared
    // No URL sync here — the router's initial listen emit re-commits this
    // route through commit(), which owns the sync.
  }, [initialRoute, route, data])

  useScrollToTop(activeRoute, disableScrollToTop)

  // Begin a fresh navigation: release the superseded pending prepare (if
  // any), prepare the new route, take ownership of the pending slot, and
  // commit. Both navigation entry points — router transitions and route
  // map changes — funnel through here.
  const beginNavigation = useCallback(
    (transformed: Route<RouteData>, matched: Route<RouteData>) => {
      if (pending.current) releaseHandles(pending.current.handles)
      pending.current = { route: transformed, matched, handles: prepareRoute(transformed, data) }
      commit(transformed, matched)
    },
    [commit, data],
  )

  useEffect(() => {
    const transition = (next: Route<RouteData>) => {
      // Transform fresh on every navigation — the transform's output can
      // legitimately change between navigations to the same matched URL
      // (e.g. a persisted-query merge whose store changed), so the fast
      // paths below must compare against today's transform.
      const transformed = transformRoute(next)

      // The first listener emit adopts the route prepared during initial
      // render. Once Router has a committed route, same-URL navigation is a
      // fresh navigation (query resets intentionally rely on this).
      if (!hasCurrentRoute.current && committed.current?.route.url === transformed.url) {
        if (pending.current) {
          releaseHandles(pending.current.handles)
          pending.current = null
        }
        commit(committed.current.route, committed.current.matched)
        return
      }

      beginNavigation(transformed, next)
    }
    return router.listen(routes, transition)
  }, [router, routes, transformRoute, commit, beginNavigation])

  useEffect(() => {
    if (previousRoutes.current === routes) return
    previousRoutes.current = routes

    const currentUrl = route?.url ?? committed.current?.route.url ?? router.getUrl()
    if (!currentUrl) return

    const matched = matcher.match(currentUrl)
    if (!matched) return

    // Deliberately none of the transition fast paths here: the URL may be
    // unchanged, but the route definitions behind it are new, so the route
    // must be re-prepared and re-committed from the new map.
    beginNavigation(transformRoute(matched), matched)
  }, [routes, router, matcher, transformRoute, beginNavigation, route?.url])

  useEffect(() => {
    const prepared = pending.current
    if (!route || !prepared || prepared.route.url !== route.url) return

    const previous = committed.current
    committed.current = prepared
    pending.current = null
    if (previous) releaseHandles(previous.handles)
  }, [route])

  useEffect(() => releaseAll, [releaseAll])

  return useMemo(() => {
    if (!activeRoute) return null

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
    const children = activeRoute.data.reduceRight<ReactNode>((children, segment) => {
      const Component = resolveSegmentComponent(segment)
      if (!Component) return children
      const ownParams = paramsDeclaredBy(segment.path, activeRoute.params)
      return (
        <Component {...ownParams} {...segment.props}>
          {children}
        </Component>
      )
    }, null)

    return <RouteContext.Provider value={activeRoute}>{children}</RouteContext.Provider>
  }, [activeRoute])
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

function useScrollToTop(route: Route<RouteData> | null, disabled?: boolean) {
  const prevScrollGroup = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!route || disabled) return

    const data = route.data[route.data.length - 1]
    const scrollGroup = data.scrollGroup || route.pathname
    if (prevScrollGroup.current !== scrollGroup) {
      prevScrollGroup.current = scrollGroup
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0)
      }
    }
  }, [route && route.pathname, disabled])
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
  const route = useRoute()
  const prefetchResolved = usePrefetchResolved()

  return useCallback(
    (to: LinkTo) => {
      prefetchResolved(targets.resolve(to, route))
    },
    [targets, route, prefetchResolved],
  )
}

function usePrefetchResolved(): (target: ResolvedTarget) => void {
  const targets = useRouterTargets()
  const { transformRoute, data } = useContext(RouterInternalsContext)

  return useCallback(
    (target: ResolvedTarget) => {
      const matched = target.routeUrl === null ? undefined : targets.match(target.routeUrl)
      if (matched) prefetchRoute(transformRoute(matched), data)
    },
    [targets, transformRoute, data],
  )
}

export interface LinkPropsResult {
  href: string
  'aria-current': 'page' | undefined
  'data-pending': '' | undefined
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void
  // Present only when a prefetch trigger is active for this link.
  onMouseEnter?: () => void
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

  const { router, pending } = useRouterCtx()
  const targets = useRouterTargets()
  const currRoute = useRoute()

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
  const { prefetchLinks } = useRouterCtx()
  const targets = useRouterTargets()
  const prefetchResolved = usePrefetchResolved()
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved

  // Link-level `prefetch` overrides the Router-level `prefetchLinks` default.
  const prefetchMode = resolvePrefetchMode(target.prefetch ?? prefetchLinks)
  const visibleObserver = useRef<IntersectionObserver | null>(null)

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
    const trigger = () => prefetchResolved(resolved)
    result.onMouseEnter = trigger
    result.onFocus = trigger
    result.onTouchStart = trigger
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
  href?: LinkTo
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

export function Link({
  href: to,
  replace,
  current,
  prefetch,
  onClick,
  onMouseEnter,
  onFocus,
  onTouchStart,
  children,
  ...anchorProps
}: LinkProps) {
  const linkTo: LinkTarget = typeof to === 'string' ? { url: to } : { ...to }
  if (replace !== undefined) linkTo.replace = replace
  if (current !== undefined) linkTo.current = current
  if (prefetch !== undefined) linkTo.prefetch = prefetch
  const linkProps = useLinkProps(linkTo)

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (onClick) onClick(event)
    linkProps.onClick(event)
  }

  return (
    <a
      aria-current={linkProps['aria-current']}
      data-pending={linkProps['data-pending']}
      {...anchorProps}
      ref={linkProps.ref}
      href={linkProps.href}
      // eslint-disable-next-line react/jsx-handler-names
      onClick={handleClick}
      onMouseEnter={composeTrigger(onMouseEnter, linkProps.onMouseEnter)}
      onFocus={composeTrigger(onFocus, linkProps.onFocus)}
      onTouchStart={composeTrigger(onTouchStart, linkProps.onTouchStart)}
    >
      {children}
    </a>
  )
}

export interface NavigateProps {
  to: To
}

export function Navigate({ to }: NavigateProps) {
  const targets = useRouterTargets()
  const route = useRoute()
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
