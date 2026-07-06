import {
  createContext,
  lazy as reactLazy,
  Suspense,
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
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

export type ResolverModule = { default: ComponentType<any> }

export type RouteResolver = () => Promise<ResolverModule>

export interface RouteData {
  path?: string
  component?: ComponentType<any> | { default: ComponentType<any> } | null
  resolver?: RouteResolver
  prepare?: RoutePrepare
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

export type To =
  | string
  | (NavigateTarget & {
      current?: boolean
    })

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
  navigate: (to: To, curr?: Route<RouteData>) => void
  isPending: boolean
  pending: PendingNavigation | null
  qs: Qs | undefined
}

export const RouterContext = createContext<RouterContextValue | undefined>(undefined)
const RouteContext = createContext<Route<RouteData> | null | undefined>(undefined)

// Plumbing between <Router> and <Routes>, kept out of the public RouterContext.
// The defaults let <Routes> render against a bare RouterContext (e.g. in
// renderToString tests) without a <Router> driving commits.
interface RouterInternals {
  transformRoute: (route: Route<RouteData>) => Route<RouteData>
  syncRouteUrl: (matched: Route<RouteData>, transformed: Route<RouteData>) => void
  commit: (route: Route<RouteData>, matched?: Route<RouteData>) => void
}

const RouterInternalsContext = createContext<RouterInternals>({
  transformRoute: (route) => route,
  syncRouteUrl: () => {},
  commit: () => {},
})

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

export function useInternalRouterInstance(): SpaceRouter<RouteData> {
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
  return useCallback(
    (to: To) => {
      return navigate(to, route ?? undefined)
    },
    [navigate, route],
  )
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

/**
 * Optional pre-commit transform. Runs synchronously between match and commit.
 * Return a modified route to change what gets committed (e.g. to merge a
 * persisted query). If the returned route's `url` differs from the matched
 * route's, the browser URL is synced via `history.replaceState` so the address
 * bar matches what the app is rendering.
 *
 * Must be pure and synchronous.
 */
export type TransformRoute = (route: Route<RouteData>) => Route<RouteData> | void

export interface RouterProps {
  mode?: Mode
  qs?: Qs
  sync?: boolean
  transformRoute?: TransformRoute
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

  // Keep the latest transform in a ref so commit() can stay referentially
  // stable while always using the freshest function.
  const transformRef = useRef(transformRoute)
  transformRef.current = transformRoute

  const applyTransform = useCallback((next: Route<RouteData>) => {
    const transform = transformRef.current
    return transform ? (transform(next) ?? next) : next
  }, [])

  const syncRouteUrl = useCallback((matched: Route<RouteData>, transformed: Route<RouteData>) => {
    if (
      transformed !== matched &&
      transformed.url &&
      transformed.url !== matched.url &&
      typeof window !== 'undefined' &&
      window.history
    ) {
      window.history.replaceState({}, '', transformed.url)
    }
  }, [])

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

      // Sync the address bar if the transform rewrote the URL. We use
      // history.replaceState directly so we don't re-trigger the router's
      // listener loop.
      syncRouteUrl(matched, next)
    },
    [syncRouteUrl],
  )

  const ctx = useMemo<RouterContextValue>(
    () => ({
      router,
      route: currRoute,
      navigate: router.navigate,
      isPending,
      pending,
      qs,
    }),
    [router, currRoute, isPending, pending, qs],
  )

  const internals = useMemo<RouterInternals>(
    () => ({ transformRoute: applyTransform, syncRouteUrl, commit }),
    [applyTransform, syncRouteUrl, commit],
  )

  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={ctx}>
      <RouterInternalsContext.Provider value={internals}>
        <DelayedSuspenseContext.Provider value={holding}>{children}</DelayedSuspenseContext.Provider>
      </RouterInternalsContext.Provider>
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

function prepareRoute(route: Route<RouteData>): PreparedHandle[] {
  const ctx: RoutePrepareContext = {
    pathname: route.pathname,
    url: route.url,
    params: route.params,
    query: route.query,
  }
  const handles: PreparedHandle[] = []

  for (const segment of route.data) {
    if (segment.resolver) preloadResolver(segment.resolver)
    if (segment.prepare) {
      const result = segment.prepare(ctx)
      if (result) {
        handles.push(...result)
      }
    }
  }

  return handles
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
  const { transformRoute, syncRouteUrl, commit } = useContext(RouterInternalsContext)

  // Pinned prepare handles for the currently committed navigation. Released
  // when a new navigation commits or when <Routes> unmounts.
  const committed = useRef<PreparedRoute | null>(null)
  const pending = useRef<PreparedRoute | null>(null)
  const previousRoutes = useRef(routes)
  const matcher = useMemo(() => createMatcher(routes, { qs }), [routes, qs])

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
      return { route: transformRoute(matched), matched }
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
    initialPrepared.current = { ...initialRoute, handles: prepareRoute(initialRoute.route) }
  }

  const activeRoute = route ?? committed.current?.route ?? initialRoute?.route ?? null

  useEffect(() => {
    if (!initialRoute || route || committed.current || pending.current) return

    const prepared =
      initialPrepared.current?.route.url === initialRoute.route.url
        ? initialPrepared.current
        : { ...initialRoute, handles: prepareRoute(initialRoute.route) }
    initialPrepared.current = null
    committed.current = prepared
    syncRouteUrl(prepared.matched, prepared.route)
  }, [initialRoute, route, syncRouteUrl])

  useScrollToTop(activeRoute, disableScrollToTop)

  useEffect(() => {
    const transition = (next: Route<RouteData>) => {
      // Transform fresh on every navigation — the transform's output can
      // legitimately change between navigations to the same matched URL
      // (e.g. a persisted-query merge whose store changed), so the fast
      // paths below must compare against today's transform.
      const transformed = transformRoute(next)

      if (committed.current?.route.url === transformed.url) {
        if (pending.current) {
          releaseHandles(pending.current.handles)
          pending.current = null
        }
        commit(committed.current.route, committed.current.matched)
        return
      }

      if (pending.current?.route.url === transformed.url) {
        commit(pending.current.route, pending.current.matched)
        return
      }

      if (pending.current) releaseHandles(pending.current.handles)

      pending.current = { route: transformed, matched: next, handles: prepareRoute(transformed) }
      commit(pending.current.route, pending.current.matched)
    }
    return router.listen(routes, transition)
  }, [router, routes, transformRoute, commit])

  useEffect(() => {
    if (previousRoutes.current === routes) return
    previousRoutes.current = routes

    const currentUrl = route?.url ?? committed.current?.route.url ?? router.getUrl()
    if (!currentUrl) return

    const matched = matcher.match(currentUrl)
    if (!matched) return

    if (pending.current) releaseHandles(pending.current.handles)
    const transformed = transformRoute(matched)
    pending.current = { route: transformed, matched, handles: prepareRoute(transformed) }
    commit(pending.current.route, pending.current.matched)
  }, [routes, router, matcher, transformRoute, commit, route?.url])

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
  const { href } = useInternalRouterInstance()
  return href
}

export interface LinkPropsResult {
  href: string
  'aria-current': 'page' | undefined
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void
  isCurrent: boolean
  isPending: boolean
}

export function useLinkProps(to: To): LinkPropsResult {
  const target: NavigateTarget & { current?: boolean } = typeof to === 'string' ? { url: to } : to

  const { router, pending } = useRouterCtx()
  const currRoute = useRoute()
  const navigate = useNavigate()
  const makeHref = useMakeHref()

  const href = target.url ? target.url : makeHref(target, currRoute ?? undefined)
  const currentPathname = currRoute?.pathname ?? router.match(router.getUrl())?.pathname
  const isCurrent =
    typeof target.current === 'undefined' ? currentPathname === href.replace(/^#/, '').split('?')[0] : target.current

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (shouldNavigate(event)) {
      event.preventDefault()
      navigate(target)
    }
  }

  const result = {
    href,
    'aria-current': isCurrent ? 'page' : undefined,
    onClick,
  } as LinkPropsResult

  Object.defineProperty(result, 'isPending', {
    enumerable: false,
    value: pending != null && (pending.matchedUrl === href || pending.route.url === href),
  })
  Object.defineProperty(result, 'isCurrent', {
    enumerable: false,
    value: isCurrent,
  })

  return result
}

export interface LinkOwnProps {
  href?: To
  replace?: boolean
  current?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export type LinkProps = LinkOwnProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkOwnProps>

export function Link({ href: to, replace, current, className, style, onClick, children, ...anchorProps }: LinkProps) {
  const linkTo: NavigateTarget & { current?: boolean } =
    typeof to === 'string' ? { url: to } : { ...(to as NavigateTarget & { current?: boolean }) }
  if (replace !== undefined) linkTo.replace = replace
  if (current !== undefined) linkTo.current = current
  const linkProps = useLinkProps(linkTo)

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (onClick) onClick(event)
    linkProps.onClick(event)
  }

  return (
    <a
      aria-current={linkProps['aria-current']}
      {...anchorProps}
      className={className}
      style={style}
      href={linkProps.href}
      // eslint-disable-next-line react/jsx-handler-names
      onClick={handleClick}
    >
      {children}
    </a>
  )
}

export interface NavigateProps {
  to: To
}

export function Navigate({ to }: NavigateProps) {
  const router = useInternalRouterInstance()
  const navigate = useNavigate()
  const route = useRoute()
  const href = router.href(to, route ?? undefined)
  const navigatedHref = useRef<string | null>(null)

  useEffect(() => {
    if (navigatedHref.current === href) return
    navigatedHref.current = href
    navigate(to)
  }, [href, navigate, to])

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
