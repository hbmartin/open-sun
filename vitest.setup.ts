import { vi } from "vitest"

Object.assign(process.env, { REVALIDATE_SECRET: "test-secret" })

;(globalThis as typeof globalThis & { jest: typeof vi }).jest = vi
