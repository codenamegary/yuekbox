import { ModelKey, modelKeyOrder } from "contracts/http/models"
import { Readiness } from "contracts/http/readiness"

/** The five user-configurable models, in report order. */
export const modelReadinessKeys = modelKeyOrder

export type ModelReadinessKey = ModelKey

/** One readiness snapshot, the capability the app consumes. */
export type ReadinessReader = () => Promise<Readiness>
