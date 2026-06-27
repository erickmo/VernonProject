import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useState } from 'react'

export type Crumb = { label: string; to?: string }

const CrumbCtx = createContext<{
  crumbs: Crumb[] | null
  setCrumbs: (c: Crumb[] | null) => void
}>({ crumbs: null, setCrumbs: () => {} })

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null)
  return <CrumbCtx.Provider value={{ crumbs, setCrumbs }}>{children}</CrumbCtx.Provider>
}

export const useCrumbs = () => useContext(CrumbCtx)

/**
 * Publish a breadcrumb trail for the current page. AppShell renders it in the
 * header, falling back to the pathname-derived crumbs when no page sets one.
 * Pass [] to explicitly clear. Clears on unmount.
 */
export function useSetCrumbs(trail: Crumb[]) {
  const { setCrumbs } = useCrumbs()
  const key = JSON.stringify(trail)
  useEffect(() => {
    setCrumbs(trail)
    return () => setCrumbs(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
