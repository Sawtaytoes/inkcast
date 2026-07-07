import * as z from "zod/mini"
import type { InkcastConfig } from "../config/env.ts"
import {
  DevicesResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  OkResponseSchema,
  SetViewRequestSchema,
} from "./schemas.ts"

/**
 * Builds the OpenAPI 3.1 document for the Inkcast HTTP API from the zod/mini
 * schemas, using zod's native `toJSONSchema` (JSON Schema 2020-12 == OpenAPI 3.1
 * schema objects). No `@hono/zod-openapi` dependency — served at `/openapi.json`
 * and rendered by the Scalar UI at `/docs`.
 */

/** zod's JSON Schema, minus the `$schema` key OpenAPI component schemas omit. */
const toComponentSchema = (schema: z.ZodMiniType) => {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
  }) as Record<string, unknown>
  return rest
}

const jsonResponse = (
  ref: string,
  description: string,
) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${ref}` },
    },
  },
})

const deviceIdParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Device id (see GET /api/devices).",
}

export const buildOpenApiDocument = ({
  config,
}: {
  config: InkcastConfig
}) => {
  const hasAuth = Boolean(config.apiToken)

  return {
    openapi: "3.1.0",
    info: {
      title: "CastKit API",
      version: "0.1.0",
      description:
        "Render and push e-ink device screens. List devices, fetch the current rendered image, force a refresh, or switch a device's active view. The same actions are available over MQTT.",
    },
    servers: [{ url: `http://localhost:${config.port}` }],
    ...(hasAuth
      ? {
          security: [{ bearerAuth: [] }],
        }
      : {}),
    components: {
      ...(hasAuth
        ? {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                description:
                  "Set INKCAST_API_TOKEN; send `Authorization: Bearer <token>`.",
              },
            },
          }
        : {}),
      schemas: {
        HealthResponse: toComponentSchema(
          HealthResponseSchema,
        ),
        DevicesResponse: toComponentSchema(
          DevicesResponseSchema,
        ),
        SetViewRequest: toComponentSchema(
          SetViewRequestSchema,
        ),
        OkResponse: toComponentSchema(OkResponseSchema),
        ErrorResponse: toComponentSchema(
          ErrorResponseSchema,
        ),
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Liveness + the available view names.",
          security: [],
          responses: {
            "200": jsonResponse("HealthResponse", "OK"),
          },
        },
      },
      "/api/devices": {
        get: {
          summary:
            "List all devices and their active view.",
          responses: {
            "200": jsonResponse(
              "DevicesResponse",
              "The device registry.",
            ),
          },
        },
      },
      "/api/devices/{id}/image": {
        get: {
          summary:
            "Render the device's active view and return the panel-ready PNG.",
          parameters: [deviceIdParam],
          responses: {
            "200": {
              description:
                "The dithered PNG for the panel.",
              content: {
                "image/png": {
                  schema: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
            "404": jsonResponse(
              "ErrorResponse",
              "Unknown device.",
            ),
          },
        },
      },
      "/api/devices/{id}/refresh": {
        post: {
          summary:
            "Re-render the active view and push it to the device.",
          parameters: [deviceIdParam],
          responses: {
            "200": jsonResponse("OkResponse", "Pushed."),
            "404": jsonResponse(
              "ErrorResponse",
              "Unknown device.",
            ),
          },
        },
      },
      "/api/devices/{id}/view": {
        post: {
          summary:
            "Set the device's active view, then render + push it.",
          parameters: [deviceIdParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SetViewRequest",
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("OkResponse", "View set."),
            "400": jsonResponse(
              "ErrorResponse",
              "Invalid view.",
            ),
            "404": jsonResponse(
              "ErrorResponse",
              "Unknown device.",
            ),
          },
        },
      },
    },
  }
}
