// Typed process.env keys, derived from the zod schema in lib/environment.ts
// so the two can never drift. Platform-injected variables that are not part
// of the schema are declared explicitly.
import type { Environment } from "./lib/environment"

declare global {
  namespace NodeJS {
    interface ProcessEnv extends Partial<Record<keyof Environment, string>> {
      VERCEL_PROJECT_PRODUCTION_URL?: string
      VERCEL_URL?: string
    }
  }
}
