/**
 * One proxy hop from a public web listener to the API listener, so streaming
 * and error responses behave the same in dev (web/src/serve.ts) and in the
 * compiled binary (server/src/binary.ts). The upstream body is buffered and
 * content-encoding is dropped, because the response is re-created with the
 * original status and headers. `fetch(target, request)` is the Request-as-init
 * form: it behaves identically to `new Request(target, request)` and
 * typechecks under the server's DOM-less type libs.
 */
export const makeApiProxy =
  (apiOrigin: string | URL) =>
  async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const target = new URL(`${url.pathname}${url.search}`, apiOrigin)
    const upstream = await fetch(target, request)
    const body = await upstream.arrayBuffer()
    const headers = new Headers(upstream.headers)
    headers.delete("content-encoding")
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  }
