// Minimal ESLint config — Biome covers formatting and most linting.
// ESLint is kept only for structural rules that enforce AGENTS.md conventions
// Biome cannot express (they need TypeScript type information):
//
//   - id-length — AGENTS.md rule #3 "spell every variable name out; no single
//     letters or abbreviations". Biome has no equivalent rule.
//
//   - @typescript-eslint/naming-convention — AGENTS.md rule #4 "booleans start
//     with `is` or `has`". Needs type info (types: ["boolean"]).
//
//   - eslint-plugin-react (react/no-multi-comp) — one component per file in the
//     view packages. Storybook stories + __fixtures__ are exempt.
//
// Mirror of mux-magic's eslint.config.js, trimmed to Inkcast's needs.

import vitestPlugin from "@vitest/eslint-plugin"
import { defineConfig } from "eslint/config"
import reactPlugin from "eslint-plugin-react"
import tseslint from "typescript-eslint"

// AGENTS.md rule #4: booleans start with `is` or `has`.
const IS_HAS_BOOLEAN_RULE = {
  selector: [
    "variable",
    "parameter",
    "typeProperty",
    "classProperty",
  ],
  types: ["boolean"],
  format: null,
  prefix: ["is", "has"],
  filter: { regex: "^(__|_)", match: false },
}

export default defineConfig(
  {
    ignores: [
      ".claude/worktrees/**",
      ".yarn/**",
      "**/build/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/public/**",
      "**/render-output/**",
      "**/scripts/**",
      "**/storybook-static/**",
      "docs/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: true,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // AGENTS.md rule #3: spell every variable name out — no single letters.
      "id-length": [
        "error",
        {
          min: 2,
          // "_" ignore-placeholder; "z" is the conventional zod namespace alias.
          exceptions: ["_", "z"],
          properties: "never",
        },
      ],
      // AGENTS.md rule #4: booleans start with `is` or `has`.
      "@typescript-eslint/naming-convention": [
        "error",
        IS_HAS_BOOLEAN_RULE,
      ],
    },
  },
  {
    // AGENTS.md convention: one component per file in the view/web packages.
    files: ["packages/{views,web}/**/*.{ts,tsx}"],
    plugins: { react: reactPlugin },
    settings: { react: { version: "19.0.0" } },
    rules: {
      "react/no-multi-comp": [
        "error",
        { ignoreStateless: false },
      ],
    },
  },
  {
    files: [
      "packages/{views,web}/**/__fixtures__/**/*.{ts,tsx}",
      "packages/{views,web}/**/*.stories.tsx",
    ],
    rules: {
      "react/no-multi-comp": "off",
    },
  },
  {
    // Standardise on test(), not it().
    files: ["**/*.test.{ts,tsx}"],
    plugins: { vitest: vitestPlugin },
    rules: {
      "vitest/consistent-test-it": [
        "error",
        { fn: "test" },
      ],
    },
  },
)
