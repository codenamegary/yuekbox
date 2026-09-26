import { toProblemError } from "@/lib/problems"

/** Parses a JSON response, turning a non-ok response into its problem error. */
export const parseJson = async <T>(response: Response, parse: (value: unknown) => T): Promise<T> => {
  if (!response.ok) throw await toProblemError(response)
  return parse(await response.json())
}
