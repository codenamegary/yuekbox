import index from "./index.html"

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8787"
const hostname = process.env.WEB_HOST ?? "127.0.0.1"
const port = Number(process.env.WEB_PORT ?? 3000)

const proxyToApi = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const target = new URL(`${url.pathname}${url.search}`, apiOrigin)
  const upstream = await fetch(new Request(target, request))
  const body = await upstream.arrayBuffer()
  const headers = new Headers(upstream.headers)
  headers.delete("content-encoding")
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

const distRoot = new URL("../dist/", import.meta.url)

const serveDist = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname
  const file = Bun.file(new URL(`.${pathname}`, distRoot))
  if (await file.exists()) return new Response(file)
  const fallback = Bun.file(new URL("./index.html", distRoot))
  if (await fallback.exists()) return new Response(fallback)
  return new Response("Not Found", { status: 404 })
}

const useDist =
  process.env.NODE_ENV === "production" &&
  process.env.YUEKBOX_WEB_DIST !== "0" &&
  (await Bun.file(new URL("./index.html", distRoot)).exists())

const server = Bun.serve({
  hostname,
  port,
  routes: {
    "/v1/*": proxyToApi,
    "/*": useDist ? serveDist : index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
})

console.log(`yuekbox web listening on ${server.url}`)
