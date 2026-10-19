'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

/**
 * Filters each person set stay set: kept in this browser under their own id, so they survive
 * signing out and coming back, and two people on one computer keep their own. Clearing a filter
 * is remembered too.
 */
const PersonContext = createContext<string>('anon')

export function RememberProvider({ personId, children }: { personId: string; children: React.ReactNode }) {
  return <PersonContext.Provider value={personId}>{children}</PersonContext.Provider>
}

export function useRememberKey(name: string): string {
  return `remember:${useContext(PersonContext)}:${name}`
}

export function readRemembered<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function writeRemembered(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

/**
 * Like useState, but remembered under `name`. The stored value is applied after the first render
 * (the server knows nothing of it). Pass `enabled: false` when the page was opened with filters of
 * its own, e.g. from a link; nothing is read or written then.
 */
export function useRemembered<T>(name: string, initial: T, enabled = true): [T, React.Dispatch<React.SetStateAction<T>>] {
  const key = useRememberKey(name)
  const [value, setValue] = useState<T>(initial)
  const loaded = useRef(false)
  useEffect(() => {
    if (!enabled) return
    const saved = readRemembered<T>(key)
    if (saved !== undefined) setValue(saved)
    loaded.current = true
  }, [key, enabled])
  useEffect(() => {
    if (enabled && loaded.current) writeRemembered(key, value)
  }, [key, value, enabled])
  return [value, setValue]
}
