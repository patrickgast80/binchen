import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// GET /app/config
// Returns the Medusa storefront publishable API key needed for NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.
// The raw token is written to Store.metadata._pub_key by the seed script on first creation.
// Call this endpoint once after deploy, then set the returned key in Vercel env vars.
// Unauthenticated — publishable keys are designed for public use (embedded in frontend).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeModule = req.scope.resolve(Modules.STORE) as any
  const [store] = await storeModule.listStores({}, { select: ["id", "metadata"] })
  const pubKey = (store?.metadata as Record<string, unknown> | null)?._pub_key ?? null
  res.json({ publishable_key: pubKey })
}
