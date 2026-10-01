import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/archivo/wdth"
import "@fontsource-variable/schibsted-grotesk/wght"
import "@fontsource-variable/jetbrains-mono/wght"
import "./index.css"
import { App } from "./App"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

const rootElement = document.getElementById("root")
if (rootElement === null) {
  throw new Error("root element is missing")
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
