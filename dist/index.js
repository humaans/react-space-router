import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, lazy as reactLazy, Suspense, useCallback, useContext, useState, useEffect, useMemo, useRef, useTransition, } from 'react';
import { createMatcher, createRouter, } from 'space-router';
export { qs } from 'space-router';
const resolverPromiseCache = new WeakMap();
const resolverComponentCache = new WeakMap();
function preloadResolver(resolver) {
    let promise = resolverPromiseCache.get(resolver);
    if (!promise) {
        promise = resolver();
        promise.catch(() => {
            // Keep the original rejected promise cached for React.lazy/error
            // boundaries, but mark preload rejections as observed.
        });
        resolverPromiseCache.set(resolver, promise);
    }
    return promise;
}
function getResolverComponent(resolver) {
    let component = resolverComponentCache.get(resolver);
    if (!component) {
        component = reactLazy(() => preloadResolver(resolver));
        resolverComponentCache.set(resolver, component);
    }
    return component;
}
export const RouterContext = createContext(undefined);
const RouteContext = createContext(undefined);
const RouterInternalsContext = createContext({
    transformRoute: (route) => route,
    commit: () => { },
});
// Internal context for `<DelayedSuspense>`. Set by `<Router>` based on
// `usePending()` + a configurable threshold. `holding` is true only during
// the pre-commit window where we want the previous route to stay on screen.
const DelayedSuspenseContext = createContext(false);
function useRouterCtx() {
    const ctx = useContext(RouterContext);
    if (!ctx) {
        throw new Error('Application must be wrapped in <Router />');
    }
    return ctx;
}
export function useInternalRouterInstance() {
    return useRouterCtx().router;
}
export function useRoute() {
    const ctx = useContext(RouterContext);
    const route = useContext(RouteContext);
    if (route !== undefined)
        return route;
    if (!ctx) {
        throw new Error('Application must be wrapped in <Router />');
    }
    return ctx.route;
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
export function usePending() {
    return useRouterCtx().isPending;
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
export function usePendingRoute() {
    return useRouterCtx().pending?.route ?? null;
}
export function useNavigate() {
    const { navigate } = useRouterCtx();
    const route = useRoute();
    return useCallback((to) => {
        return navigate(to, route ?? undefined);
    }, [navigate, route]);
}
function makeRouter(routerOpts) {
    const { mode, qs, sync } = routerOpts;
    const router = createRouter({
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
    });
    return { router, routerOpts };
}
const DEFAULT_PENDING_DELAY_MS = 1000;
export function Router({ mode, qs, sync, transformRoute, pendingDelayMs = DEFAULT_PENDING_DELAY_MS, children, }) {
    const [{ router, routerOpts }, setRouter] = useState(() => makeRouter({ mode, qs, sync }));
    const [currRoute, setCurrRoute] = useState(null);
    const [pending, setPending] = useState(null);
    const [isPending, startRouterTransition] = useTransition();
    // `holding` is true during the pre-commit window where `<DelayedSuspense>`
    // boundaries should re-throw their fallback (so the previous route stays
    // committed). It flips off either after `pendingDelayMs` elapses while
    // still pending, or when the transition settles — whichever comes first.
    const [holding, setHolding] = useState(false);
    useEffect(() => {
        if (!isPending) {
            setHolding(false);
            return;
        }
        setHolding(true);
        const t = setTimeout(() => setHolding(false), pendingDelayMs);
        return () => clearTimeout(t);
    }, [isPending, pendingDelayMs]);
    // Keep the latest transform in a ref so commit() can stay referentially
    // stable while always using the freshest function.
    const transformRef = useRef(transformRoute);
    transformRef.current = transformRoute;
    const applyTransform = useCallback((next) => {
        const transform = transformRef.current;
        return transform ? (transform(next) ?? next) : next;
    }, []);
    const commit = useCallback((next, matched = next) => {
        // The urgent set makes the pending navigation visible immediately;
        // the clear is deferred inside the transition so it only lands once
        // the destination has settled. Commit is the single owner of pending
        // state, which is why clicks, programmatic navigation, and browser
        // back/forward all register the same way.
        setPending({ route: next, matchedUrl: matched.url });
        startRouterTransition(() => {
            setCurrRoute(next);
            setPending(null);
        });
        // Sync the address bar if the transform rewrote the URL. replaceUrl
        // is mode-aware and silent, so it can't re-trigger the router's
        // listener loop.
        if (next !== matched && next.url && next.url !== matched.url) {
            router.replaceUrl(next.url);
        }
    }, [router]);
    const ctx = useMemo(() => ({
        router,
        route: currRoute,
        navigate: router.navigate,
        isPending,
        pending,
        qs,
    }), [router, currRoute, isPending, pending, qs]);
    const internals = useMemo(() => ({ transformRoute: applyTransform, commit }), [applyTransform, commit]);
    useEffect(() => {
        if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
            setRouter(makeRouter({ mode, qs, sync }));
        }
    }, [routerOpts, mode, qs, sync]);
    return (_jsx(RouterContext.Provider, { value: ctx, children: _jsx(RouterInternalsContext.Provider, { value: internals, children: _jsx(DelayedSuspenseContext.Provider, { value: holding, children: children }) }) }));
}
export function DelayedSuspense({ fallback, children }) {
    const holding = useContext(DelayedSuspenseContext);
    return _jsx(Suspense, { fallback: holding ? _jsx(DelayedSuspenseHold, {}) : fallback, children: children });
}
const NEVER_RESOLVES = new Promise(() => { });
/**
 * Throws a never-resolving promise so the surrounding Suspense boundary's
 * fallback path itself suspends — the suspension bubbles up to the next
 * Suspense boundary above, which during a router transition is the
 * already-committed root holding the previous route.
 */
function DelayedSuspenseHold() {
    throw NEVER_RESOLVES;
}
function prepareRoute(route) {
    const ctx = {
        pathname: route.pathname,
        url: route.url,
        params: route.params,
        query: route.query,
    };
    const handles = [];
    for (const segment of route.data) {
        if (segment.resolver)
            preloadResolver(segment.resolver);
        if (segment.prepare) {
            const result = segment.prepare(ctx);
            if (result) {
                handles.push(...result);
            }
        }
    }
    return handles;
}
function releaseHandles(handles) {
    for (const handle of handles) {
        try {
            handle.release();
        }
        catch {
            // best-effort
        }
    }
}
export function Routes({ routes, disableScrollToTop }) {
    const { router, route, qs } = useRouterCtx();
    const { transformRoute, commit } = useContext(RouterInternalsContext);
    // Pinned prepare handles for the currently committed navigation. Released
    // when a new navigation commits or when <Routes> unmounts.
    const committed = useRef(null);
    const pending = useRef(null);
    const previousRoutes = useRef(routes);
    const matcher = useMemo(() => createMatcher(routes, { qs }), [routes, qs]);
    const releaseAll = useCallback(() => {
        const handles = new Set([...(committed.current?.handles ?? []), ...(pending.current?.handles ?? [])]);
        releaseHandles([...handles]);
        committed.current = null;
        pending.current = null;
    }, []);
    const initialRoute = useMemo(() => {
        if (route)
            return null;
        const matched = matcher.match(router.getUrl());
        if (matched) {
            return { route: transformRoute(matched), matched };
        }
        return null;
    }, [route, router, matcher, transformRoute]);
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
    const initialPrepared = useRef(null);
    if (initialRoute && !committed.current && initialPrepared.current?.route.url !== initialRoute.route.url) {
        initialPrepared.current = { ...initialRoute, handles: prepareRoute(initialRoute.route) };
    }
    const activeRoute = route ?? committed.current?.route ?? initialRoute?.route ?? null;
    useEffect(() => {
        if (!initialRoute || route || committed.current || pending.current)
            return;
        // Usually the render phase prepared this exact route and we adopt its
        // handles. The fallback is reachable, not dead: under StrictMode's
        // mount→cleanup→remount cycle the first mount adopts the handles and
        // nulls the ref, the cleanup releases them via releaseAll, and this
        // effect then runs again with the same closure — the route must be
        // re-prepared because the original handles were already released.
        const prepared = initialPrepared.current?.route.url === initialRoute.route.url
            ? initialPrepared.current
            : { ...initialRoute, handles: prepareRoute(initialRoute.route) };
        initialPrepared.current = null;
        committed.current = prepared;
        // No URL sync here — the router's initial listen emit re-commits this
        // route through commit(), which owns the sync.
    }, [initialRoute, route]);
    useScrollToTop(activeRoute, disableScrollToTop);
    // Begin a fresh navigation: release the superseded pending prepare (if
    // any), prepare the new route, take ownership of the pending slot, and
    // commit. Both navigation entry points — router transitions and route
    // map changes — funnel through here.
    const beginNavigation = useCallback((transformed, matched) => {
        if (pending.current)
            releaseHandles(pending.current.handles);
        pending.current = { route: transformed, matched, handles: prepareRoute(transformed) };
        commit(transformed, matched);
    }, [commit]);
    useEffect(() => {
        const transition = (next) => {
            // Transform fresh on every navigation — the transform's output can
            // legitimately change between navigations to the same matched URL
            // (e.g. a persisted-query merge whose store changed), so the fast
            // paths below must compare against today's transform.
            const transformed = transformRoute(next);
            if (committed.current?.route.url === transformed.url) {
                if (pending.current) {
                    releaseHandles(pending.current.handles);
                    pending.current = null;
                }
                commit(committed.current.route, committed.current.matched);
                return;
            }
            if (pending.current?.route.url === transformed.url) {
                commit(pending.current.route, pending.current.matched);
                return;
            }
            beginNavigation(transformed, next);
        };
        return router.listen(routes, transition);
    }, [router, routes, transformRoute, commit, beginNavigation]);
    useEffect(() => {
        if (previousRoutes.current === routes)
            return;
        previousRoutes.current = routes;
        const currentUrl = route?.url ?? committed.current?.route.url ?? router.getUrl();
        if (!currentUrl)
            return;
        const matched = matcher.match(currentUrl);
        if (!matched)
            return;
        // Deliberately none of the transition fast paths here: the URL may be
        // unchanged, but the route definitions behind it are new, so the route
        // must be re-prepared and re-committed from the new map.
        beginNavigation(transformRoute(matched), matched);
    }, [routes, router, matcher, transformRoute, beginNavigation, route?.url]);
    useEffect(() => {
        const prepared = pending.current;
        if (!route || !prepared || prepared.route.url !== route.url)
            return;
        const previous = committed.current;
        committed.current = prepared;
        pending.current = null;
        if (previous)
            releaseHandles(previous.handles);
    }, [route]);
    useEffect(() => releaseAll, [releaseAll]);
    return useMemo(() => {
        if (!activeRoute)
            return null;
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
        const children = activeRoute.data.reduceRight((children, segment) => {
            const Component = resolveSegmentComponent(segment);
            if (!Component)
                return children;
            const ownParams = paramsDeclaredBy(segment.path, activeRoute.params);
            return (_jsx(Component, { ...ownParams, ...segment.props, children: children }));
        }, null);
        return _jsx(RouteContext.Provider, { value: activeRoute, children: children });
    }, [activeRoute]);
}
// Mirrors space-router's `:name` path param grammar. The modifier flags
// (`+*?`) that can follow a param don't affect name extraction.
const PATH_PARAM_NAME_RE = /:([A-Za-z0-9_]+)/g;
/**
 * Picks out of `matched` only the params whose names appear as `:name`
 * segments in `path`. A layout segment with no path returns `{}`; a leaf
 * with `/users/:userId/posts/:postId` returns `{ userId, postId }`.
 */
function paramsDeclaredBy(path, matched) {
    if (!path)
        return {};
    const own = {};
    for (const match of path.matchAll(PATH_PARAM_NAME_RE)) {
        const name = match[1];
        if (name in matched)
            own[name] = matched[name];
    }
    return own;
}
function resolveSegmentComponent(segment) {
    if (segment.resolver) {
        return getResolverComponent(segment.resolver);
    }
    const component = segment.component;
    if (!component)
        return null;
    return typeof component === 'function' ? component : component.default;
}
function useScrollToTop(route, disabled) {
    const prevScrollGroup = useRef(undefined);
    useEffect(() => {
        if (!route || disabled)
            return;
        const data = route.data[route.data.length - 1];
        const scrollGroup = data.scrollGroup || route.pathname;
        if (prevScrollGroup.current !== scrollGroup) {
            prevScrollGroup.current = scrollGroup;
            if (typeof window !== 'undefined') {
                window.scrollTo(0, 0);
            }
        }
    }, [route && route.pathname, disabled]);
}
// ---------------------------------------------------------------------------
// Link / Navigate
// ---------------------------------------------------------------------------
export function useMakeHref() {
    const { href } = useInternalRouterInstance();
    return href;
}
// Shared target resolution for `useLinkProps` / `useLinkState`: normalize
// the target, build the href, and derive current/pending state against the
// router's committed and in-flight routes.
function useLinkTarget(to) {
    const target = typeof to === 'string' ? { url: to } : to;
    const { router, pending } = useRouterCtx();
    const currRoute = useRoute();
    const makeHref = useMakeHref();
    const href = target.url ? target.url : makeHref(target, currRoute ?? undefined);
    // Hash-mode hrefs are written with a leading `#` (e.g. `#/users`), but
    // route urls from the router never carry it — strip it before comparing.
    const hrefUrl = href.replace(/^#/, '');
    const currentPathname = currRoute?.pathname ?? router.match(router.getUrl())?.pathname;
    const isCurrent = typeof target.current === 'undefined' ? currentPathname === hrefUrl.split('?')[0] : target.current;
    const isPending = pending != null && (pending.matchedUrl === hrefUrl || pending.route.url === hrefUrl);
    return { target, href, isCurrent, isPending };
}
/**
 * Anchor props for a router-driven `<a>`: `{ href, aria-current, data-pending,
 * onClick }`. Everything returned is spreadable. Style current links with
 * `a[aria-current='page']` and pending links with `a[data-pending]` in CSS;
 * for programmatic reads use `useLinkState(to)`.
 */
export function useLinkProps(to) {
    const { target, href, isCurrent, isPending } = useLinkTarget(to);
    const navigate = useNavigate();
    function onClick(event) {
        if (shouldNavigate(event)) {
            event.preventDefault();
            navigate(target);
        }
    }
    return {
        href,
        'aria-current': isCurrent ? 'page' : undefined,
        'data-pending': isPending ? '' : undefined,
        onClick,
    };
}
/**
 * Per-target link state without the anchor props: `{ isCurrent, isPending }`.
 * Accepts the same target as `useLinkProps`, but works for any navigable UI,
 * not just anchors — tab strips, sidebar items, breadcrumb spinners.
 */
export function useLinkState(to) {
    const { isCurrent, isPending } = useLinkTarget(to);
    return { isCurrent, isPending };
}
export function Link({ href: to, replace, current, onClick, children, ...anchorProps }) {
    const linkTo = typeof to === 'string' ? { url: to } : { ...to };
    if (replace !== undefined)
        linkTo.replace = replace;
    if (current !== undefined)
        linkTo.current = current;
    const linkProps = useLinkProps(linkTo);
    function handleClick(event) {
        if (onClick)
            onClick(event);
        linkProps.onClick(event);
    }
    return (_jsx("a", { "aria-current": linkProps['aria-current'], "data-pending": linkProps['data-pending'], ...anchorProps, href: linkProps.href, 
        // eslint-disable-next-line react/jsx-handler-names
        onClick: handleClick, children: children }));
}
export function Navigate({ to }) {
    const router = useInternalRouterInstance();
    const navigate = useNavigate();
    const route = useRoute();
    const href = router.href(to, route ?? undefined);
    const navigatedHref = useRef(null);
    useEffect(() => {
        if (navigatedHref.current === href)
            return;
        navigatedHref.current = href;
        navigate(to);
    }, [href, navigate, to]);
    return null;
}
export function shouldNavigate(e) {
    if (e.defaultPrevented || e.button !== 0)
        return false;
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
        return false;
    const el = e.currentTarget;
    if (el && el.tagName === 'A') {
        const a = el;
        // let the browser handle these: opening in a new tab/window, downloads,
        // and cross-origin or non-http(s) protocols (mailto:, tel:, ...)
        if (a.target && a.target !== '_self')
            return false;
        if (a.hasAttribute('download'))
            return false;
        if (typeof window !== 'undefined' && a.origin && a.origin !== window.location.origin)
            return false;
        if (typeof window !== 'undefined' &&
            a.hash &&
            a.origin === window.location.origin &&
            a.pathname === window.location.pathname &&
            a.search === window.location.search) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=index.js.map