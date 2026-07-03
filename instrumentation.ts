import { getEnvironment } from "@/lib/environment"

export function register() {
  // Validate required env vars at server startup so a misconfigured
  // deployment fails immediately instead of on the first request.
  getEnvironment()
}
