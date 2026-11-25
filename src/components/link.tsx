'use client'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, type ComponentProps } from 'react'

/**
 * Next's Link, prefetched only when someone means to follow it. Prefetching every link that
 * scrolls into view ran the page frame on the server for each one: a grid of 300 links made
 * hundreds of calls nobody asked for. Not prefetching at all made each click wait for the whole
 * page before anything moved. So a link prefetches (once) when the pointer rests on it, or it is
 * focused or touched: by the click, the page's loading screen is ready and shows at once.
 * Pass prefetch to opt back in to Next's own prefetching where a link is almost always followed.
 */
export default function Link({ prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof NextLink>) {
  const router = useRouter()
  const done = useRef(false)
  const href = typeof props.href === 'string' ? props.href : null
  const warm = () => {
    if (done.current || !href || !href.startsWith('/') || props.target === '_blank') return
    done.current = true
    router.prefetch(href)
  }
  return (
    <NextLink prefetch={prefetch ?? false} {...props}
      onMouseEnter={(e) => { warm(); onMouseEnter?.(e) }}
      onFocus={(e) => { warm(); onFocus?.(e) }}
      onTouchStart={(e) => { warm(); onTouchStart?.(e) }} />
  )
}
