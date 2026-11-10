import { NextResponse } from 'next/server'

/** Any /api/ address that is not a route: a JSON 404, not the sign-in page. */
const notFound = () => NextResponse.json({ error: 'No such API route. GET /api/reference lists them.' }, { status: 404 })
export { notFound as GET, notFound as POST, notFound as PATCH, notFound as PUT, notFound as DELETE }
