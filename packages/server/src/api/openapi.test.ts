import { describe, expect, test } from "vitest"
import { loadConfig } from "../config/env.ts"
import { buildOpenApiDocument } from "./openapi.ts"

describe("buildOpenApiDocument", () => {
  const document = buildOpenApiDocument({
    config: loadConfig({}),
  })

  test("is an OpenAPI 3.1 document", () => {
    expect(document.openapi).toBe("3.1.0")
  })

  test("documents every endpoint", () => {
    expect(Object.keys(document.paths)).toEqual([
      "/health",
      "/api/devices",
      "/api/devices/{id}/image",
      "/api/devices/{id}/refresh",
      "/api/devices/{id}/view",
    ])
  })

  test("the SetViewRequest schema lists the valid views", () => {
    const schema = document.components.schemas
      .SetViewRequest as {
      properties: { view: { enum: string[] } }
    }
    expect(schema.properties.view.enum).toEqual([
      "Now Playing (Dashboard)",
      "Now Playing (Editorial)",
      "Now Playing (Poster)",
      "Photo Frame",
      "Clock",
    ])
  })

  test("omits bearer security when no token is configured", () => {
    expect(
      document.components.securitySchemes,
    ).toBeUndefined()
  })
})
