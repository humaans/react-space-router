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
function buildPrepareContext(route) {
    const r = route;
    return {
        pathname: r.pathname ?? '',
        url: r.url ?? r.pathname ?? '',
        params: r.params ?? {},
        query: r.query ?? {},
    };
}
function routeHasRedirect(route) {
    return !!route?.data?.some((segment) => Boolean(segment.redirect));
}
export const RouterContext = createContext(undefined);
const RouteContext = createContext(undefined);
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
    const route = useContext(RouteContext);
    return route === undefined ? useRouterCtx().route : route;
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
export function useNavigate() {
    const { navigate } = useRouterCtx();
    const route = useRoute();
    return useCallback((to) => {
        return navigate(to, route);
    }, [navigate, route]);
}
function makeRouter(routerOpts) {
    const router = createRouter({ mode: routerOpts.mode, qs: routerOpts.qs, sync: routerOpts.sync });
    return { router, routerOpts };
}
const DEFAULT_PENDING_DELAY_MS = 1000;
export function Router({ mode, qs, sync, transformRoute, pendingDelayMs = DEFAULT_PENDING_DELAY_MS, children, }) {
    const [{ router, routerOpts }, setRouter] = useState(() => makeRouter({ mode, qs, sync }));
    const [currRoute, setCurrRoute] = useState(null);
    const [pendingHref, setPendingHref] = useState(null);
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
    const syncRouteUrl = useCallback((matched, transformed) => {
        const matchedUrl = matched.url;
        const transformedUrl = transformed.url;
        if (transformed !== matched &&
            transformedUrl &&
            transformedUrl !== matchedUrl &&
            typeof window !== 'undefined' &&
            window.history) {
            window.history.replaceState({}, '', transformedUrl);
        }
    }, []);
    const commit = useCallback((next, matched = next) => {
        const matchedUrl = matched.url;
        const transformedUrl = next.url;
        startRouterTransition(() => {
            setCurrRoute(next);
            setPendingHref((current) => {
                if (!current)
                    return current;
                if (current === matchedUrl || current === transformedUrl)
                    return null;
                return routeHasRedirect(router.match(current)) ? null : current;
            });
        });
        // Sync the address bar if the transform rewrote the URL. We use
        // history.replaceState directly so we don't re-trigger the router's
        // listener loop.
        syncRouteUrl(matched, next);
    }, [router, syncRouteUrl]);
    const navigate = useCallback((to, curr) => {
        const href = router.href(to, curr);
        setPendingHref(href);
        router.navigate(to, curr);
        if (!router.match(href)) {
            setPendingHref(null);
        }
    }, [router]);
    const ctx = useMemo(() => ({
        router,
        route: currRoute,
        transformRoute: applyTransform,
        syncRouteUrl,
        commit,
        navigate,
        isPending,
        pendingHref,
        qs,
    }), [router, currRoute, applyTransform, syncRouteUrl, commit, navigate, isPending, pendingHref, qs]);
    useEffect(() => {
        if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
            setRouter(makeRouter({ mode, qs, sync }));
        }
    }, [routerOpts, mode, qs, sync]);
    return (_jsx(RouterContext.Provider, { value: ctx, children: _jsx(DelayedSuspenseContext.Provider, { value: holding, children: children }) }));
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
    const segments = (route.data ?? []);
    const ctx = buildPrepareContext(route);
    const handles = [];
    for (const segment of segments) {
        if (segment.resolver)
            preloadResolver(segment.resolver);
        if (segment.prepare) {
            const result = segment.prepare(ctx);
            if (result) {
                for (const handle of result) {
                    handles.push(handle);
                }
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
function releaseUniqueHandles(handleGroups) {
    const released = new Set();
    for (const handles of handleGroups) {
        for (const handle of handles) {
            if (released.has(handle))
                continue;
            released.add(handle);
            releaseHandles([handle]);
        }
    }
}
export function Routes({ routes, disableScrollToTop }) {
    const { router, route, transformRoute, syncRouteUrl, commit, qs } = useRouterCtx();
    // Pinned prepare handles for the currently committed navigation. Released
    // when a new navigation commits or when <Routes> unmounts.
    const committed = useRef(null);
    const pending = useRef(null);
    const didSeedInitialRoute = useRef(false);
    const previousRoutes = useRef(routes);
    const matcher = useMemo(() => createMatcher(routes, { qs }), [routes, qs]);
    const prepareMatched = useCallback((matched) => {
        const transformed = transformRoute(matched);
        return { route: transformed, matched, handles: prepareRoute(transformed) };
    }, [transformRoute]);
    const releaseAll = useCallback(() => {
        releaseUniqueHandles([committed.current?.handles ?? [], pending.current?.handles ?? []]);
        committed.current = null;
        pending.current = null;
    }, []);
    if (!didSeedInitialRoute.current && !route) {
        didSeedInitialRoute.current = true;
        const matched = matcher.match(router.getUrl());
        if (matched) {
            committed.current = prepareMatched(matched);
        }
    }
    const activeRoute = route ?? committed.current?.route ?? null;
    useScrollToTop(activeRoute, disableScrollToTop);
    useEffect(() => {
        if (committed.current)
            syncRouteUrl(committed.current.matched, committed.current.route);
    }, [syncRouteUrl]);
    useEffect(() => {
        const transition = (next) => {
            const nextUrl = next.url ?? next.pathname;
            const matched = matcher.match(nextUrl) ?? next;
            const matchedRoute = transformRoute(matched);
            if (committed.current?.route.url === matchedRoute.url) {
                if (pending.current) {
                    releaseHandles(pending.current.handles);
                    pending.current = null;
                }
                commit(committed.current.route, committed.current.matched);
                return;
            }
            if (pending.current?.route.url === matchedRoute.url) {
                commit(pending.current.route, pending.current.matched);
                return;
            }
            if (pending.current)
                releaseHandles(pending.current.handles);
            pending.current = prepareMatched(matched);
            commit(pending.current.route, pending.current.matched);
        };
        return router.listen(routes, transition);
    }, [router, routes, matcher, transformRoute, prepareMatched, commit]);
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
        if (pending.current)
            releaseHandles(pending.current.handles);
        pending.current = prepareMatched(matched);
        commit(pending.current.route, pending.current.matched);
    }, [routes, router, matcher, prepareMatched, commit, route?.url]);
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
        const segments = activeRoute.data;
        const matchedParams = (activeRoute.params ?? {});
        const children = segments.reduceRight((children, segment) => {
            const segProps = segment.props ?? {};
            const Component = resolveSegmentComponent(segment);
            if (!Component)
                return children;
            const ownParams = paramsDeclaredBy(segment.path, matchedParams);
            return (_jsx(Component, { ...ownParams, ...segProps, children: children }));
        }, null);
        return _jsx(RouteContext.Provider, { value: activeRoute, children: children });
    }, [activeRoute]);
}
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
    if (!segment.component)
        return null;
    const c = segment.component;
    return c.default || c;
}
function useScrollToTop(route, disabled) {
    const prevScrollGroup = useRef(undefined);
    useEffect(() => {
        if (!route || disabled)
            return;
        const datas = route.data;
        const data = datas[datas.length - 1];
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
export function useLinkProps(to) {
    const target = typeof to === 'string' ? { url: to } : to;
    const { router, pendingHref } = useRouterCtx();
    const currRoute = useRoute();
    const navigate = useNavigate();
    const makeHref = useMakeHref();
    const href = target.url ? target.url : makeHref(target, currRoute);
    const currentPathname = currRoute?.pathname ?? router.match(router.getUrl())?.pathname;
    const isCurrent = typeof target.current === 'undefined' ? currentPathname === href.replace(/^#/, '').split('?')[0] : target.current;
    function onClick(event) {
        if (shouldNavigate(event)) {
            event.preventDefault();
            navigate(target);
        }
    }
    const result = {
        href,
        'aria-current': isCurrent ? 'page' : undefined,
        onClick,
    };
    Object.defineProperty(result, 'isPending', {
        enumerable: false,
        value: pendingHref === href,
    });
    Object.defineProperty(result, 'isCurrent', {
        enumerable: false,
        value: isCurrent,
    });
    return result;
}
export function Link({ href: to, replace, current, className, style, onClick, children, ...anchorProps }) {
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
    return (_jsx("a", { "aria-current": linkProps['aria-current'], ...anchorProps, className: className, style: style, href: linkProps.href, 
        // eslint-disable-next-line react/jsx-handler-names
        onClick: handleClick, children: children }));
}
export function Navigate({ to }) {
    const router = useInternalRouterInstance();
    const navigate = useNavigate();
    const route = useRoute();
    const href = router.href(to, route);
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
    }
    return true;
}
//# sourceMappingURL=index.js.map