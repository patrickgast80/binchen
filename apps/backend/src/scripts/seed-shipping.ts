import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
// core-flows lives under @medusajs/medusa; with NodeNext-incompatible resolution we
// import via the dist subpath that ships the .d.ts in the published package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const coreFlows: any = require("@medusajs/medusa/core-flows")
const createRegionsWorkflow = coreFlows.createRegionsWorkflow
const createShippingProfilesWorkflow = coreFlows.createShippingProfilesWorkflow
const createShippingOptionsWorkflow = coreFlows.createShippingOptionsWorkflow
const updateShippingOptionsWorkflow = coreFlows.updateShippingOptionsWorkflow

// Seed flat-rate shipping (BIL-31):
//   DE    = €5
//   EU    = €10  (AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, GR, HU, IE, IT, LV,
//                 LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE)
//   WORLD = €20  (catch-all: US, GB, CH, NO, AU, CA, JP)
//
// Idempotent — re-running is a no-op once the regions/options exist.
// Run with: medusa exec ./src/scripts/seed-shipping.ts
export default async function seedShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionModule = container.resolve(Modules.REGION)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as any
  // query.graph is used by the BIL-2403 reprice sweep to resolve shipping_option prices.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const DE = ["de"]
  const EU = [
    "at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "gr", "hu",
    "ie", "it", "lv", "lt", "lu", "mt", "nl", "pl", "pt", "ro", "sk", "si",
    "es", "se",
  ]
  const WORLD = ["us", "gb", "ch", "no", "au", "ca", "jp"]

  // BIL-2403: Medusa v2 stores prices as decimal major units, not cents.
  // The old values 500/1000/2000 were persisted by the Store API as 500/1000/2000 EUR
  // (Live checkout showed "Standard DE = 500,00 €" — Abmahnung-Risiko unter § 1 PAngV).
  // Retail target for flat-rate DE/EU/WORLD is 5/10/20 EUR — passed as major units.
  const zones: { name: "DE" | "EU" | "WORLD"; countries: string[]; price: number }[] = [
    { name: "DE", countries: DE, price: 5 },
    { name: "EU", countries: EU, price: 10 },
    { name: "WORLD", countries: WORLD, price: 20 },
  ]

  logger.info("Seeding flat-rate shipping (BIL-31)...")

  // 1. Regions — one per zone, currency EUR
  const existingRegions = await regionModule.listRegions({})
  const regionByName = new Map(existingRegions.map((r) => [r.name, r] as const))
  const toCreateRegions = zones
    .filter((z) => !regionByName.has(z.name))
    .map((z) => ({
      name: z.name,
      currency_code: "eur",
      countries: z.countries,
      automatic_taxes: true,
    }))
  if (toCreateRegions.length > 0) {
    const { result: created } = await createRegionsWorkflow(container).run({
      input: { regions: toCreateRegions },
    })
    for (const r of created) regionByName.set(r.name, r)
    logger.info(`Created ${created.length} region(s).`)
  } else {
    logger.info("Regions already present.")
  }

  // 2. Default shipping profile
  const existingProfiles = await fulfillmentModule.listShippingProfiles({ name: "Default" })
  let defaultProfile = existingProfiles[0]
  if (!defaultProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default", type: "default" }] },
    })
    defaultProfile = result[0]
    logger.info("Created Default shipping profile.")
  }

  // 3. Stock location — reuse "Binchen Atelier" if seeded, else create
  let [stockLocation] = await stockLocationModule.listStockLocations({ name: "Binchen Atelier" })
  if (!stockLocation) {
    ;[stockLocation] = await stockLocationModule.createStockLocations([
      { name: "Binchen Atelier" },
    ])
  }

  // 4. Fulfillment set + service zones, attached to the stock location.
  // Manual fulfillment provider is registered by default as "manual_manual".
  let [fulfillmentSet] = await fulfillmentModule.listFulfillmentSets({ name: "Binchen Shipping" })
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentModule.createFulfillmentSets({
      name: "Binchen Shipping",
      type: "shipping",
      service_zones: zones.map((z) => ({
        name: z.name,
        geo_zones: z.countries.map((c) => ({ type: "country" as const, country_code: c })),
      })),
    })
    try {
      await remoteLink.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
        [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
      })
    } catch (err) {
      logger.warn(`Stock location <-> fulfillment set link (non-fatal): ${err}`)
    }
    logger.info("Created Binchen Shipping fulfillment set with 3 zones.")
  }

  // BIL-2399: createShippingOptionsWorkflow validates that each option's provider
  // is enabled at the option's stock location. Without an explicit
  // fulfillment_provider <-> stock_location link, the workflow throws
  //   "Providers (manual_manual,...) are not enabled for the service location"
  // and no shipping_option rows are created — Live checkout dead-ends.
  // Link is idempotent: creating a duplicate throws → swallow.
  try {
    await remoteLink.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })
    logger.info("Linked manual_manual fulfillment provider to Binchen Atelier.")
  } catch (err) {
    logger.info(`Provider <-> stock location link already exists (ok): ${err}`)
  }

  const serviceZones = await fulfillmentModule.listServiceZones({
    fulfillment_set: { id: fulfillmentSet.id },
  })
  const zoneByName = new Map(serviceZones.map((z) => [z.name, z] as const))

  // 5. Shipping options — one flat-rate per zone, region-scoped
  const existingOptions = await fulfillmentModule.listShippingOptions({})
  const existingNames = new Set(existingOptions.map((o) => o.name))

  const optionsToCreate = zones
    .filter((z) => !existingNames.has(`Standard ${z.name}`))
    .map((z) => {
      const region = regionByName.get(z.name)
      const serviceZone = zoneByName.get(z.name)
      if (!region || !serviceZone) {
        throw new Error(`Missing region or service zone for ${z.name}`)
      }
      return {
        name: `Standard ${z.name}`,
        service_zone_id: serviceZone.id,
        shipping_profile_id: defaultProfile.id,
        provider_id: "manual_manual",
        type: {
          label: "Standard",
          description: `Flat-rate shipping to ${z.name}`,
          code: `standard-${z.name.toLowerCase()}`,
        },
        price_type: "flat" as const,
        prices: [
          { currency_code: "eur", amount: z.price },
          { region_id: region.id, amount: z.price },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
          { attribute: "is_return", value: "false", operator: "eq" as const },
        ],
      }
    })

  if (optionsToCreate.length > 0) {
    await createShippingOptionsWorkflow(container).run({ input: optionsToCreate })
    logger.info(`Created ${optionsToCreate.length} shipping option(s).`)
  } else {
    logger.info("Shipping options already present.")
  }

  // BIL-2403: Reprice sweep — for every seeded zone, sync the linked shipping_option
  // prices to the intended major-unit EUR value. This corrects options that were
  // created by an earlier seed run that (mistakenly) passed cent values like 500
  // which Medusa v2 stores as 500 EUR. Idempotent on every boot.
  let repricedCount = 0
  try {
    const targetByName = new Map<string, number>()
    for (const z of zones) targetByName.set(`Standard ${z.name}`, z.price)
    const optionGraph = await query.graph({
      entity: "shipping_option",
      fields: [
        "id",
        "name",
        "prices.id",
        "prices.amount",
        "prices.currency_code",
        "prices.region_id",
      ],
      filters: { name: Array.from(targetByName.keys()) },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = optionGraph?.data ?? []
    for (const row of rows) {
      const target = targetByName.get(row.name)
      if (typeof target !== "number") continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prices: any[] = row.prices ?? []
      const mismatched = prices.filter((p) => {
        if (p?.currency_code !== "eur") return false
        const amount = p?.amount != null ? Number(p.amount) : null
        return amount !== target
      })
      if (mismatched.length === 0) continue
      const updatedPrices = mismatched.map((p) => ({
        id: p.id as string,
        amount: target,
      }))
      try {
        await updateShippingOptionsWorkflow(container).run({
          input: [{ id: row.id, prices: updatedPrices }],
        })
        for (const p of mismatched) {
          logger.info(
            `Repriced ${row.name} (${p.region_id ? "region" : "currency"}): ` +
            `${p.amount ?? "n/a"} → ${target} EUR (price ${p.id}).`
          )
          repricedCount++
        }
      } catch (err) {
        logger.warn(`Reprice failed for ${row.name} (non-fatal): ${err}`)
      }
    }
    logger.info(`Shipping reprice sweep complete: ${repricedCount} price(s) synced.`)
  } catch (err) {
    logger.warn(`Shipping reprice sweep failed (non-fatal): ${err}`)
  }

  // BIL-2407/2408: Medusa v2 requires every product to be linked to a
  // shipping_profile. Options only satisfy items whose product shares the
  // option's profile — without this link `/store/carts/{id}/complete` throws
  //   "The cart items require shipping profiles that are not satisfied by
  //    the current shipping methods"
  // (Live evidence: cart_01KXVBSCDC6E0T1MMYZJHV67KK, 400 on complete).
  //
  // seed.ts creates products without a profile link (Medusa's product module
  // has no shipping_profile_id field on createProducts). We backfill here —
  // after `defaultProfile` is guaranteed — by linking every product missing
  // a profile to Default. Idempotent: duplicate links throw and are swallowed.
  let linkedProductCount = 0
  try {
    const productGraph = await query.graph({
      entity: "product",
      fields: ["id", "handle", "shipping_profile.id"],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productRows: any[] = productGraph?.data ?? []
    const unlinked = productRows.filter((p) => {
      // shipping_profile may be null, absent, or [] when unlinked.
      const sp = p?.shipping_profile
      if (!sp) return true
      if (Array.isArray(sp)) return sp.length === 0
      return !sp.id
    })
    logger.info(
      `Product<->shipping_profile backfill: ${productRows.length} product(s), ` +
      `${unlinked.length} missing a profile link.`
    )
    for (const p of unlinked) {
      try {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: p.id },
          [Modules.FULFILLMENT]: { shipping_profile_id: defaultProfile.id },
        })
        linkedProductCount++
      } catch (err) {
        // Duplicate link — safe to ignore. Anything else, log and continue so
        // one bad row doesn't abort the whole backfill.
        const msg = err instanceof Error ? err.message : String(err)
        if (!/exist|duplicate|unique/i.test(msg)) {
          logger.warn(`Product ${p.handle ?? p.id} link failed (non-fatal): ${msg}`)
        }
      }
    }
    logger.info(`Linked ${linkedProductCount} product(s) to Default shipping profile.`)
  } catch (err) {
    logger.warn(`Product<->shipping_profile backfill failed (non-fatal): ${err}`)
  }

  logger.info("Shipping seed complete.")
}
