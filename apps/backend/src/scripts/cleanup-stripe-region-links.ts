import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// BIL-128: Remove the dormant `pp_stripe_stripe` payment provider linked to
// every region from the pre-pivot deploy. The previous remoteLink.dismiss
// approach silently no-op'd on the live container (BIL-126 verify-chain
// confirmed pp_stripe_stripe still surfaced after multiple deploys), so this
// script now goes straight at the link table via the framework's knex
// connection. Idempotent — re-runs delete 0 rows.
export default async function cleanupStripeRegionLinks({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  const before = await pg("region_payment_provider")
    .where({ payment_provider_id: "pp_stripe_stripe" })
    .count("* as count")
  const beforeCount = Number(before[0]?.count ?? 0)

  if (beforeCount === 0) {
    logger.info("[BIL-128] No stripe region-links present — nothing to clean.")
    return
  }

  const deleted = await pg("region_payment_provider")
    .where({ payment_provider_id: "pp_stripe_stripe" })
    .del()

  logger.info(
    `[BIL-128] Stripe region-link cleanup: deleted ${deleted}/${beforeCount} rows from region_payment_provider.`
  )
}
