import * as z from "zod/mini"
import { VIEW_NAMES } from "../views/registry.ts"

/**
 * zod/mini schemas for the HTTP API — the single source of truth for both
 * request validation and the generated OpenAPI document (via zod's native
 * `toJSONSchema`).
 */

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  views: z.array(z.string()),
})

export const DeviceSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  width: z.number(),
  height: z.number(),
  colourMode: z.enum(["mono", "e6"]),
  rotation: z.number(),
  activeView: z.string(),
})

export const DevicesResponseSchema = z.object({
  devices: z.array(DeviceSummarySchema),
})

export const SetViewRequestSchema = z.object({
  view: z.enum(VIEW_NAMES),
})

export const OkResponseSchema = z.object({
  ok: z.literal(true),
  view: z.optional(z.enum(VIEW_NAMES)),
})

export const ErrorResponseSchema = z.object({
  error: z.string(),
})
