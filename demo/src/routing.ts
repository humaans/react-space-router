export const hostedDemo = import.meta.env.VITE_HOSTED_DEMO === 'true'

export const routerMode = hostedDemo ? 'hash' : 'history'

export function demoHref(path: string): string {
  return hostedDemo ? `#${path}` : path
}
