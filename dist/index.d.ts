import { type AnchorHTMLAttributes, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { type Mode, type NavigateTarget, type Qs, type Route, type RouteDefinition, type Router as SpaceRouter } from 'space-router';
export { qs } from 'space-router';
interface RouterContextValue {
    router: SpaceRouter;
    useRoute: () => Route | null;
    onNavigating?: (route: Route) => void | Promise<void>;
    onNavigated: (route: Route) => void;
}
export declare const RouterContext: import("react").Context<RouterContextValue | undefined>;
export declare const CurrRouteContext: import("react").Context<Route<Record<string, unknown>> | null>;
export declare function useInternalRouterInstance(): SpaceRouter;
export declare function useRoute(): Route | null;
export declare function useNavigate(): (to: To) => void;
export interface RouterProps {
    mode?: Mode;
    qs?: Qs;
    sync?: boolean;
    useRoute?: () => Route | null;
    onNavigating?: (route: Route) => void | Promise<void>;
    onNavigated?: (route: Route) => void;
    children?: ReactNode;
}
export declare function Router({ mode, qs, sync, useRoute, onNavigating, onNavigated, children }: RouterProps): import("react/jsx-runtime").JSX.Element;
export interface RoutesProps {
    routes: RouteDefinition[];
    disableScrollToTop?: boolean;
}
export declare function Routes({ routes, disableScrollToTop }: RoutesProps): ReactNode;
export declare function useMakeHref(): (to: import("space-router").To, curr?: Route<Record<string, unknown>> | undefined) => string;
export type To = string | (NavigateTarget & {
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
    current?: boolean;
});
export interface LinkPropsResult {
    href: string;
    'aria-current': 'page' | undefined;
    onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}
export declare function useLinkProps(to: To): LinkPropsResult;
type FnOr<T> = T | ((isCurrent: boolean) => T);
export interface LinkOwnProps {
    href?: To;
    replace?: boolean;
    current?: boolean;
    className?: FnOr<string | undefined>;
    style?: FnOr<CSSProperties | undefined>;
    extraProps?: (isCurrent: boolean) => Record<string, unknown>;
    children?: ReactNode;
}
export type LinkProps = LinkOwnProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkOwnProps | 'onClick'>;
export declare function Link({ href: to, replace, current, className, style, extraProps, children, ...anchorProps }: LinkProps): import("react/jsx-runtime").JSX.Element;
export interface NavigateProps {
    to: To;
}
export declare function Navigate({ to }: NavigateProps): null;
export declare function shouldNavigate(e: MouseEvent): boolean;
//# sourceMappingURL=index.d.ts.map