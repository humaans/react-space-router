import { type AnchorHTMLAttributes, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import { type Mode, type NavigateTarget, type Qs, type Route, type RouteDefinition, type Router as SpaceRouter } from 'space-router';
export { qs } from 'space-router';
export type { Route } from 'space-router';
export interface RoutePrepareContext {
    pathname: string;
    url: string;
    params: Record<string, string>;
    query: Record<string, unknown>;
}
/**
 * Lifecycle handle returned by data-layer `prepare()` calls (e.g. `figbird.prepare`).
 * The router pins the underlying cache entries via `release()` for the lifetime of
 * the navigation; superseded navigations release their handles immediately.
 */
export interface PreparedHandle {
    promise: Promise<unknown>;
    release(): void;
}
export type RoutePrepare = (ctx: RoutePrepareContext) => readonly PreparedHandle[] | PreparedHandle[] | void;
export type ResolverModule = {
    default: ComponentType<any>;
};
export type RouteResolver = () => Promise<ResolverModule>;
export interface RouteData {
    path?: string;
    component?: ComponentType<any> | {
        default: ComponentType<any>;
    } | null;
    resolver?: RouteResolver;
    prepare?: RoutePrepare;
    props?: Record<string, unknown>;
    scrollGroup?: string;
    routes?: RouteData[];
    [extra: string]: unknown;
}
export type To = string | NavigateTarget;
type LinkTarget = NavigateTarget & {
    current?: boolean;
};
export type LinkTo = string | LinkTarget;
interface PendingNavigation {
    route: Route<RouteData>;
    matchedUrl: string;
}
interface RouterContextValue {
    router: SpaceRouter<RouteData>;
    route: Route<RouteData> | null;
    navigate: (to: To, curr?: Route<RouteData>) => void;
    isPending: boolean;
    pending: PendingNavigation | null;
    qs: Qs | undefined;
}
export declare const RouterContext: import("react").Context<RouterContextValue | undefined>;
export declare function useInternalRouterInstance(): SpaceRouter<RouteData>;
export declare function useRoute(): Route<RouteData> | null;
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
export declare function usePending(): boolean;
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
export declare function usePendingRoute(): Route<RouteData> | null;
export declare function useNavigate(): (to: To) => void;
/**
 * Optional pre-commit transform. Runs synchronously between match and commit.
 * Return a modified route to change what gets committed (e.g. to merge a
 * persisted query). If the returned route's `url` differs from the matched
 * route's, the browser URL is synced via `history.replaceState` so the address
 * bar matches what the app is rendering.
 *
 * Must be pure and synchronous.
 */
export type TransformRoute = (route: Route<RouteData>) => Route<RouteData> | void;
export interface RouterProps {
    mode?: Mode;
    qs?: Qs;
    sync?: boolean;
    transformRoute?: TransformRoute;
    /**
     * How long to hold the previous route on screen before `<DelayedSuspense>`
     * boundaries fall back to their fallback content. Default is `1000` ms.
     * No effect on plain `<Suspense>` boundaries — those always show their
     * fallback the moment the boundary mounts.
     */
    pendingDelayMs?: number;
    children?: ReactNode;
}
export declare function Router({ mode, qs, sync, transformRoute, pendingDelayMs, children, }: RouterProps): import("react").JSX.Element;
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
    fallback: ReactNode;
    children?: ReactNode;
}
export declare function DelayedSuspense({ fallback, children }: DelayedSuspenseProps): import("react").JSX.Element;
export interface RoutesProps {
    routes: RouteDefinition<RouteData>[];
    disableScrollToTop?: boolean;
}
export declare function Routes({ routes, disableScrollToTop }: RoutesProps): import("react").JSX.Element | null;
export declare function useMakeHref(): (to: import("space-router").To, curr?: Route<RouteData> | undefined) => string;
export interface LinkPropsResult {
    href: string;
    'aria-current': 'page' | undefined;
    onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
    isCurrent: boolean;
    isPending: boolean;
}
export declare function useLinkProps(to: LinkTo): LinkPropsResult;
export interface LinkOwnProps {
    href?: LinkTo;
    replace?: boolean;
    current?: boolean;
    children?: ReactNode;
}
export type LinkProps = LinkOwnProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkOwnProps>;
export declare function Link({ href: to, replace, current, onClick, children, ...anchorProps }: LinkProps): import("react").JSX.Element;
export interface NavigateProps {
    to: To;
}
export declare function Navigate({ to }: NavigateProps): null;
export declare function shouldNavigate(e: MouseEvent): boolean;
//# sourceMappingURL=index.d.ts.map