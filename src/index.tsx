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
  priority?: 'route' | 'defer'
  key?: string | number
}

export type RoutePrepare = (ctx: RoutePrepareContext) => readonly PreparedHandle[] | PreparedHandle[] | void

export type ResolverModule = { default: ComponentType<any> }

export type RouteResolver = () => Promise<ResolverModule>

export interface RouteNavigationOptions {
  /**
   * `'immediate'` (default): commit the new route synchronously inside a React
   * transition; let any unresolved route-priority data suspend at the
   * destination's `<Suspense>` boundary.
   *
   * `'ready'` is reserved for a follow-up release.
   */
  commit?: 'immediate'
}

export interface RouteData {
  path?: string
  component?: ComponentType<any> | { default: ComponentType<any> }
  resolver?: RouteResolver
  prepare?: RoutePrepare
  navigation?: RouteNavigationOptions
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

function buildPrepareContext(route: Route): RoutePrepareContext {
  const r = route as Route & {
    pathname?: string
    params?: Record<string, string | number>
    query?: Record<string, unknown>
  }
  return {
    pathname: r.pathname ?? '',
    url: (r as Route & { url?: string }).url ?? r.pathname ?? '',
    params: r.params ?? {},
    query: r.query ?? {},
  }
}

function routeHasRedirect(route: Route | undefined): boolean {
  return !!route?.data?.some((segment) => Boolean((segment as { redirect?: unknown }).redirect))
}

// ---------------------------------------------------------------------------
// Router context
// ---------------------------------------------------------------------------

export type To =
  | string
  | (NavigateTarget & {
      current?: boolean
    })

interface RouterContextValue {
  router: SpaceRouter
  route: Route | null
  transformRoute: (route: Route) => Route
  syncRouteUrl: (matched: Route, transformed: Route) => void
  commit: (route: Route, matched?: Route) => void
  navigate: (to: To, curr?: Route) => void
  isPending: boolean
  pendingHref: string | null
  qs: Qs | undefined
}

export const RouterContext = createContext<RouterContextValue | undefined>(undefined)
const RouteContext = createContext<Route | null | undefined>(undefined)

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

export function useInternalRouterInstance(): SpaceRouter {
  return useRouterCtx().router
}

export function useRoute(): Route | null {
  const route = useContext(RouteContext)
  return route === undefined ? useRouterCtx().route : route
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

export function useNavigate() {
  const { navigate } = useRouterCtx()
  const route = useRoute()
  return useCallback(
    (to: To) => {
      return navigate(to, route as Route | undefined)
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
  router: SpaceRouter
  routerOpts: RouterOpts
}

function makeRouter(routerOpts: RouterOpts): InternalRouter {
  const router = createRouter({ mode: routerOpts.mode, qs: routerOpts.qs, sync: routerOpts.sync })
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
export type TransformRoute = (route: Route) => Route | void

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

  const [currRoute, setCurrRoute] = useState<Route | null>(null)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
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

  const applyTransform = useCallback((next: Route) => {
    const transform = transformRef.current
    return transform ? (transform(next) ?? next) : next
  }, [])

  const syncRouteUrl = useCallback((matched: Route, transformed: Route) => {
    const matchedUrl = (matched as Route & { url?: string }).url
    const transformedUrl = (transformed as Route & { url?: string }).url

    if (
      transformed !== matched &&
      transformedUrl &&
      transformedUrl !== matchedUrl &&
      typeof window !== 'undefined' &&
      window.history
    ) {
      window.history.replaceState({}, '', transformedUrl)
    }
  }, [])

  const commit = useCallback(
    (next: Route, matched: Route = next) => {
      const matchedUrl = (matched as Route & { url?: string }).url
      const transformedUrl = (next as Route & { url?: string }).url

      startRouterTransition(() => {
        setCurrRoute(next)
        setPendingHref((current) => {
          if (!current) return current
          if (current === matchedUrl || current === transformedUrl) return null
          return routeHasRedirect(router.match(current)) ? null : current
        })
      })

      // Sync the address bar if the transform rewrote the URL. We use
      // history.replaceState directly so we don't re-trigger the router's
      // listener loop.
      syncRouteUrl(matched, next)
    },
    [router, syncRouteUrl],
  )

  const navigate = useCallback(
    (to: To, curr?: Route) => {
      const href = router.href(to, curr)
      setPendingHref(href)
      router.navigate(to, curr)
      if (!router.match(href)) {
        setPendingHref(null)
      }
    },
    [router],
  )

  const ctx = useMemo<RouterContextValue>(
    () => ({
      router,
      route: currRoute,
      transformRoute: applyTransform,
      syncRouteUrl,
      commit,
      navigate,
      isPending,
      pendingHref,
      qs,
    }),
    [router, currRoute, applyTransform, syncRouteUrl, commit, navigate, isPending, pendingHref, qs],
  )

  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={ctx}>
      <DelayedSuspenseContext.Provider value={holding}>{children}</DelayedSuspenseContext.Provider>
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
  route: Route
  matched: Route
  handles: PreparedHandle[]
}

function prepareRoute(route: Route): PreparedHandle[] {
  const segments = (route.data ?? []) as RouteData[]
  const ctx = buildPrepareContext(route)
  const handles: PreparedHandle[] = []

  for (const segment of segments) {
    if (segment.resolver) preloadResolver(segment.resolver)
    if (segment.prepare) {
      const result = segment.prepare(ctx)
      if (result) {
        for (const handle of result) {
          handles.push(handle)
        }
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

function releaseUniqueHandles(handleGroups: PreparedHandle[][]) {
  const released = new Set<PreparedHandle>()
  for (const handles of handleGroups) {
    for (const handle of handles) {
      if (released.has(handle)) continue
      released.add(handle)
      releaseHandles([handle])
    }
  }
}

export function Routes({ routes, disableScrollToTop }: RoutesProps) {
  const { router, route, transformRoute, syncRouteUrl, commit, qs } = useRouterCtx()

  // Pinned prepare handles for the currently committed navigation. Released
  // when a new navigation commits or when <Routes> unmounts.
  const committed = useRef<PreparedRoute | null>(null)
  const pending = useRef<PreparedRoute | null>(null)
  const didSeedInitialRoute = useRef(false)
  const previousRoutes = useRef(routes)
  const matcher = useMemo(() => createMatcher(routes, { qs }), [routes, qs])

  const prepareMatched = useCallback(
    (matched: Route): PreparedRoute => {
      const transformed = transformRoute(matched)
      return { route: transformed, matched, handles: prepareRoute(transformed) }
    },
    [transformRoute],
  )

  const releaseAll = useCallback(() => {
    releaseUniqueHandles([committed.current?.handles ?? [], pending.current?.handles ?? []])
    committed.current = null
    pending.current = null
  }, [])

  if (!didSeedInitialRoute.current && !route) {
    didSeedInitialRoute.current = true
    const matched = matcher.match(router.getUrl())
    if (matched) {
      committed.current = prepareMatched(matched)
    }
  }

  const activeRoute = route ?? committed.current?.route ?? null
  useScrollToTop(activeRoute, disableScrollToTop)

  useEffect(() => {
    if (committed.current) syncRouteUrl(committed.current.matched, committed.current.route)
  }, [syncRouteUrl])

  useEffect(() => {
    const transition = (next: Route) => {
      const nextUrl = (next as Route & { url?: string; pathname?: string }).url ?? next.pathname
      const matched = matcher.match(nextUrl) ?? next
      const matchedRoute = transformRoute(matched)

      if (committed.current?.route.url === matchedRoute.url) {
        if (pending.current) {
          releaseHandles(pending.current.handles)
          pending.current = null
        }
        commit(committed.current.route, committed.current.matched)
        return
      }

      if (pending.current?.route.url === matchedRoute.url) {
        commit(pending.current.route, pending.current.matched)
        return
      }

      if (pending.current) releaseHandles(pending.current.handles)

      pending.current = prepareMatched(matched)
      commit(pending.current.route, pending.current.matched)
    }
    return router.listen(routes, transition)
  }, [router, routes, matcher, transformRoute, prepareMatched, commit])

  useEffect(() => {
    if (previousRoutes.current === routes) return
    previousRoutes.current = routes

    const currentUrl = route?.url ?? committed.current?.route.url ?? router.getUrl()
    if (!currentUrl) return

    const matched = matcher.match(currentUrl)
    if (!matched) return

    if (pending.current) releaseHandles(pending.current.handles)
    pending.current = prepareMatched(matched)
    commit(pending.current.route, pending.current.matched)
  }, [routes, router, matcher, prepareMatched, commit, route?.url])

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
    const segments = activeRoute.data as RouteData[]
    const matchedParams = ((activeRoute as Route & { params?: Record<string, string> }).params ?? {}) as Record<
      string,
      string
    >

    const children = segments.reduceRight<ReactNode>((children, segment) => {
      const segProps = (segment as { props?: Record<string, unknown> }).props ?? {}
      const Component = resolveSegmentComponent(segment)
      if (!Component) return children
      const ownParams = paramsDeclaredBy(segment.path, matchedParams)
      return (
        <Component {...ownParams} {...segProps}>
          {children}
        </Component>
      )
    }, null)

    return <RouteContext.Provider value={activeRoute}>{children}</RouteContext.Provider>
  }, [activeRoute])
}

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
  if (!segment.component) return null
  const c = segment.component as { default?: ComponentType<any> } & ComponentType<any>
  return c.default || c
}

function useScrollToTop(route: Route | null, disabled?: boolean) {
  const prevScrollGroup = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!route || disabled) return

    const datas = route.data
    const data = datas[datas.length - 1] as { scrollGroup?: string }
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

  const { router, pendingHref } = useRouterCtx()
  const currRoute = useRoute()
  const navigate = useNavigate()
  const makeHref = useMakeHref()

  const href = target.url ? target.url : makeHref(target, currRoute as Route | undefined)
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
    value: pendingHref === href,
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
  const href = router.href(to, route as Route | undefined)
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
