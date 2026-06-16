import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const STRIPE_PROVIDER_ID = "pp_stripe_stripe"

// POST /admin/cleanup-stripe-region-links
//
// BIL-128 — explicit, observable counterpart to the boot-time cleanup script.
// Deletes any region<->pp_stripe_stripe link rows left from the pre-BIL-124
// deploy and returns before/after counts so verification is one curl away
// instead of waiting for a Render cold-start log line we cannot see.
//
// Idempotent: re-runs return deleted: 0. Admin auth is enforced by the built-in
// /admin/* middleware.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  const before = await pg("region_payment_provider")
    .where({ payment_provider_id: STRIPE_PROVIDER_ID })
    .count("* as count")
  const beforeCount = Number(before[0]?.count ?? 0)

  if (beforeCount === 0) {
    return res.json({
      deleted: 0,
      before: 0,
      after: 0,
      provider_id: STRIPE_PROVIDER_ID,
    })
  }

  const deleted = await pg("region_payment_provider")
    .where({ payment_provider_id: STRIPE_PROVIDER_ID })
    .del()

  const after = await pg("region_payment_provider")
    .where({ payment_provider_id: STRIPE_PROVIDER_ID })
    .count("* as count")
  const afterCount = Number(after[0]?.count ?? 0)

  res.json({
    deleted,
    before: beforeCount,
    after: afterCount,
    provider_id: STRIPE_PROVIDER_ID,
  })
}
