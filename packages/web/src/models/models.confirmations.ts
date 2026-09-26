import { ModelKey } from "contracts/http/models"

/**
 * "Prompt once per model and remember the choice" lives in the browser: the
 * dialog's confirmation is stored per model key, so the next generation for
 * that model starts without asking again. The server-side threshold check
 * still applies; this only spares the click.
 */
export type DownloadConfirmations = Readonly<{
  confirmed: (key: ModelKey) => boolean
  remember: (key: ModelKey) => void
}>

const storageKey = (key: ModelKey): string => `yuekbox.confirm-download.${key}`

export const makeDownloadConfirmations = (storage: {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}): DownloadConfirmations => ({
  confirmed: (key) => storage.getItem(storageKey(key)) === "1",
  remember: (key) => storage.setItem(storageKey(key), "1"),
})

/** The browser-backed instance the UI uses. */
export const downloadConfirmations = makeDownloadConfirmations(
  typeof localStorage === "undefined"
    ? { getItem: () => null, setItem: () => undefined }
    : localStorage,
)
