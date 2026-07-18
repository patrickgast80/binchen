import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
// core-flows lives under @medusajs/medusa; with NodeNext-incompatible resolution we
// import via the dist subpath that ships the .d.ts in the published package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const coreFlows: any = require("@medusajs/medusa/core-flows")
const createRegionsWorkflow = coreFlows.createRegionsWorkflow
const createShippingProfilesWorkflow = coreFlows.createShippingProfilesWorkflow
const createShippingOptionsWorkflow = coreFlows.createShippingOptionsWorkflow

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

  const DE = ["de"]
  const EU = [
    "at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "gr", "hu",
    "ie", "it", "lv", "lt", "lu", "mt", "nl", "pl", "pt", "ro", "sk", "si",
    "es", "se",
  ]
  const WORLD = ["us", "gb", "ch", "no", "au", "ca", "jp"]

  const zones: { name: "DE" | "EU" | "WORLD"; countries: string[]; price: number }[] = [
    { name: "DE", countries: DE, price: 500 },
    { name: "EU", countries: EU, price: 1000 },
    { name: "WORLD", countries: WORLD, price: 2000 },
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

  logger.info("Shipping seed complete.")
}
