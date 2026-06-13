import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// BIL-29 was cancelled (board pivoted to PayPal-only). A prior deploy linked
// `pp_stripe_stripe` to every region; setRegionsPaymentProvidersStep treats
// `payment_providers: []` as a no-op, so we dismiss the region<->stripe links
// directly via remoteLink. Idempotent — re-runs silently when no links exist.
//
// Remove this script after the next successful deploy verifies regions return
// no stripe in /store/payment-providers?region_id=…
export default async function cleanupStripeRegionLinks({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionModule = container.resolve(Modules.REGION)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as any

  const regions = await regionModule.listRegions({})
  if (regions.length === 0) {
    logger.info("No regions present — nothing to clean.")
    return
  }

  const dismissed: string[] = []
  for (const region of regions) {
    try {
      await remoteLink.dismiss({
        [Modules.REGION]: { region_id: region.id },
        [Modules.PAYMENT]: { payment_provider_id: "pp_stripe_stripe" },
      })
      dismissed.push(region.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/not found|does not exist/i.test(msg)) {
        logger.warn(`Region ${region.name} stripe-link dismiss (non-fatal): ${err}`)
      }
    }
  }
  logger.info(`Stripe region-link cleanup: dismissed ${dismissed.length}/${regions.length} (${dismissed.join(", ") || "none"}).`)
}
