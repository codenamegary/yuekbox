import { z } from "zod"

export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)

export const TimestampSchema = z.iso.datetime()

export const CursorSchema = z.string().min(1)
