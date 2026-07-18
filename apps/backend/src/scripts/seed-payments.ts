import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  LINKS,
  Modules,
} from "@medusajs/framework/utils"

// BIL-2394 — Attach payment providers to every region.
//
// The payment module loader registers `pp_system_default` (offline/Vorkasse)
// on every boot; `pp_paypal` is registered when PAYPAL_CLIENT_ID +
// PAYPAL_CLIENT_SECRET are set. Registration only marks the provider as
// enabled globally — to make it selectable at checkout for a given region
// we still need a link row per (region, provider) in the RegionPaymentProvider
// link table.
//
// Idempotent: lists existing links via remoteQuery, creates only the missing
// ones via remoteLink.create. Safe to re-run on every boot.
//
// Run with: medusa exec ./src/scripts/seed-payments.ts
export default async function seedPayments({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionModule = container.resolve(Modules.REGION)
  const paymentModule = container.resolve(Modules.PAYMENT)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteQuery = container.resolve(
    ContainerRegistrationKeys.REMOTE_QUERY,
  ) as any

  const providerCandidates: string[] = ["pp_system_default"]
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    providerCandidates.push("pp_paypal")
  }

  // Only link providers that are actually registered + enabled in the DB.
  // Payment module loader marks disabled providers with is_enabled=false when
  // they're removed from config, so filtering here avoids a MedusaError.
  const enabledProviders = await paymentModule.listPaymentProviders({
    id: providerCandidates,
    is_enabled: true,
  })
  const providersToLink = enabledProviders.map((p) => p.id)

  if (providersToLink.length === 0) {
    logger.warn(
      `None of the candidate providers [${providerCandidates.join(", ")}] are enabled. Skipping.`,
    )
    return
  }

  logger.info(
    `Seeding region-payment-provider links: ${providersToLink.join(", ")}`,
  )

  const regions = await regionModule.listRegions({})
  if (!regions.length) {
    logger.warn("No regions found — run seed-shipping first. Skipping.")
    return
  }

  const regionIds = regions.map((r) => r.id)

  const existingLinks: { region_id: string; payment_provider_id: string }[] =
    await remoteQuery({
      service: LINKS.RegionPaymentProvider,
      variables: { filters: { region_id: regionIds } },
      fields: ["region_id", "payment_provider_id"],
    })

  const existingByRegion = new Map<string, Set<string>>()
  for (const link of existingLinks) {
    if (!existingByRegion.has(link.region_id)) {
      existingByRegion.set(link.region_id, new Set())
    }
    existingByRegion.get(link.region_id)!.add(link.payment_provider_id)
  }

  const linksToCreate: Array<Record<string, Record<string, string>>> = []
  for (const region of regions) {
    const linked = existingByRegion.get(region.id) ?? new Set<string>()
    for (const providerId of providersToLink) {
      if (!linked.has(providerId)) {
        linksToCreate.push({
          [Modules.REGION]: { region_id: region.id },
          [Modules.PAYMENT]: { payment_provider_id: providerId },
        })
      }
    }
  }

  if (linksToCreate.length === 0) {
    logger.info("All region-payment-provider links already present.")
    return
  }

  await remoteLink.create(linksToCreate)
  logger.info(
    `Created ${linksToCreate.length} region-payment-provider link(s).`,
  )
}
