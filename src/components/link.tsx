import NextLink from 'next/link'
import type { ComponentProps } from 'react'

/**
 * Next's Link without prefetching. Nearly every page has a loading screen, so a prefetched link
 * runs the page frame on the server as soon as it scrolls into view: a grid of 300 links made
 * hundreds of server calls nobody asked for. Pages still open at once on the loading screen.
 * Pass prefetch to opt back in where a link is almost always followed.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />
}
