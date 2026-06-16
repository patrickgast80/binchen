import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CATALOG_MODULE } from "../modules/catalog"

// Seed script: creates 5 placeholder handmade baby/children items
// Run with: medusa exec ./src/scripts/seed.ts
export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const pricingModule = container.resolve(Modules.PRICING)
  // remoteLink is the Medusa v2 cross-module link service; required for variant→inventory
  // and variant→priceSet associations (upsertProductVariants does not accept those fields).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as any

  // CATALOG_MODULE is a custom module — if auto-discovery fails in the compiled bundle
  // the seed must still create core products.  Resolve it defensively.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let catalogModule: any = null
  try {
    catalogModule = container.resolve(CATALOG_MODULE)
  } catch (err) {
    logger.warn(`CATALOG_MODULE not available (non-fatal): ${err}`)
  }

  logger.info("Seeding Binchen catalog...")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let apiKeyModule: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storeModule: any = null
  try {
    apiKeyModule = container.resolve(Modules.API_KEY)
    storeModule = container.resolve(Modules.STORE)
  } catch (err) {
    logger.warn(`API key / store module resolve failed (non-fatal): ${err}`)
  }

  // Bootstrap publishable API key — runs every startup, idempotent.
  // Captures the key id so we can link it to the Online Store sales channel below.
  let publishableKeyId: string | null = null
  try {
    if (apiKeyModule) {
      const existingKeys = await apiKeyModule.listApiKeys({ title: "Storefront" })
      if (!existingKeys || existingKeys.length === 0) {
        const newKey = await apiKeyModule.createApiKeys({
          title: "Storefront",
          type: "publishable",
          created_by: "seed",
        })
        const created = Array.isArray(newKey) ? newKey[0] : newKey
        publishableKeyId = created?.id ?? null
        const rawToken: string | undefined = created?.token
        if (rawToken && storeModule) {
          const [store] = await storeModule.listStores({})
          if (store) {
            await storeModule.updateStores([{
              id: store.id,
              metadata: { ...((store.metadata as Record<string, unknown>) ?? {}), _pub_key: rawToken },
            }])
          }
          logger.info(`=== BINCHEN PUBLISHABLE KEY: ${rawToken} ===`)
        }
      } else {
        publishableKeyId = existingKeys[0]?.id ?? null
        // If _pub_key is missing from store metadata (deployed before this seed
        // was updated), revoke the stale key and create a fresh one to capture
        // the raw token, then write it to metadata.
        if (storeModule) {
          const [store] = await storeModule.listStores({})
          const meta = (store?.metadata as Record<string, unknown> | null) ?? {}
          if (store && !meta._pub_key && publishableKeyId) {
            logger.info("_pub_key missing from store metadata — revoking stale key and recreating.")
            await apiKeyModule.revokeApiKeys([publishableKeyId])
            const newKey = await apiKeyModule.createApiKeys({
              title: "Storefront",
              type: "publishable",
              created_by: "seed",
            })
            const created = Array.isArray(newKey) ? newKey[0] : newKey
            publishableKeyId = created?.id ?? null
            const rawToken: string | undefined = created?.token
            if (rawToken) {
              await storeModule.updateStores([{
                id: store.id,
                metadata: { ...meta, _pub_key: rawToken },
              }])
              logger.info(`=== BINCHEN PUBLISHABLE KEY: ${rawToken} ===`)
            }
          } else {
            logger.info("Publishable API key already exists with _pub_key in metadata — skipping.")
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`Publishable key bootstrap error (non-fatal): ${err}`)
  }

  // Per-product idempotency: gather the SKUs already in the DB so we can skip
  // products that exist and create only the ones that are still missing.
  // (The previous all-or-nothing guard meant a partial seed — e.g. the BIL-19
  // crash that landed 2 of 5 products — could never be completed by re-running.)
  const existingSkus = new Set<string>()
  try {
    const [existingVariants] = await productModule.listAndCountProductVariants(
      {},
      { take: 1000, select: ["sku"] },
    )
    for (const v of existingVariants) {
      if (v?.sku) existingSkus.add(v.sku)
    }
    logger.info(`Found ${existingSkus.size} existing variant SKUs in catalog.`)
  } catch (err) {
    logger.warn(`Could not enumerate existing SKUs (non-fatal, will assume empty): ${err}`)
  }

  // Create (or reuse) default sales channel + link publishable API key to it
  // so /store/products works without manual admin intervention.
  let onlineStore: { id: string } | null = null
  try {
    const existingChannels = await salesChannelModule.listSalesChannels({ name: "Online Store" })
    if (existingChannels && existingChannels.length > 0) {
      onlineStore = existingChannels[0]
    } else {
      const [created] = await salesChannelModule.createSalesChannels([{ name: "Online Store" }])
      onlineStore = created
    }
  } catch (err) {
    logger.warn(`Sales channel bootstrap failed (non-fatal): ${err}`)
  }

  if (onlineStore && publishableKeyId) {
    try {
      await remoteLink.create({
        [Modules.API_KEY]: { publishable_key_id: publishableKeyId },
        [Modules.SALES_CHANNEL]: { sales_channel_id: onlineStore.id },
      })
      logger.info(`Linked publishable key ${publishableKeyId} -> sales channel ${onlineStore.id}`)
    } catch (err) {
      logger.warn(`API key <-> sales channel link failed (non-fatal, may already exist): ${err}`)
    }
  }

  // Stock location (Binchen Atelier) — reuse if it already exists so a re-run
  // doesn't accumulate duplicate locations.
  let stockLocation: { id: string }
  const existingLocations = await stockLocationModule.listStockLocations({ name: "Binchen Atelier" })
  if (existingLocations && existingLocations.length > 0) {
    stockLocation = existingLocations[0]
  } else {
    const [created] = await stockLocationModule.createStockLocations([
      { name: "Binchen Atelier" },
    ])
    stockLocation = created
  }

  // Price set currency
  const EUR = "eur"

  const products = [
    {
      title: "Bio-Baumwolle Strampler – Waldtiere",
      description: "Weicher Strampler aus 100% GOTS-zertifizierter Bio-Baumwolle mit liebevoll gestickten Waldtieren. Handgemacht in Deutschland.",
      variants: [{ title: "56 / 0-2 Monate", sku: "STR-WALD-56" }],
      meta: {
        sizeLabel: "56",
        sizeCmMin: 56,
        sizeCmMax: 56,
        fabric: "100% Bio-Baumwolle (GOTS)",
        ageMonthsMin: 0,
        ageMonthsMax: 2,
        ageCategory: "newborn",
        careInstructions: "30°C Schonwaschgang, nicht bleichen, liegend trocknen",
      },
      priceEur: 3800, // 38.00 EUR in cents
    },
    {
      title: "Jersey Bodysuits Set – Regenbogen (2er-Pack)",
      description: "Zwei handgenähte Kurzarm-Bodys aus weichem Baumwoll-Jersey. Doppelter Kragen für leichtes An- und Ausziehen.",
      variants: [
        { title: "62 / 2-4 Monate", sku: "BODY-RAIN-62" },
        { title: "68 / 4-6 Monate", sku: "BODY-RAIN-68" },
      ],
      meta: {
        sizeLabel: "62-68",
        sizeCmMin: 62,
        sizeCmMax: 68,
        fabric: "95% Baumwoll-Jersey, 5% Elasthan",
        ageMonthsMin: 2,
        ageMonthsMax: 6,
        ageCategory: "baby",
        careInstructions: "40°C, links waschen",
      },
      priceEur: 4200,
    },
    {
      title: "Musselinhose – Salbeigrün",
      description: "Luftige Sommerhose aus doppellagigem Musselin. Gummizug, handgenähte Säume.",
      variants: [{ title: "74-80 / 9-12 Monate", sku: "HOSE-MUS-74" }],
      meta: {
        sizeLabel: "74-80",
        sizeCmMin: 74,
        sizeCmMax: 80,
        fabric: "100% Musselin (Bio-Baumwolle)",
        ageMonthsMin: 9,
        ageMonthsMax: 12,
        ageCategory: "baby",
        careInstructions: "30°C Schonwaschgang, liegend trocknen",
      },
      priceEur: 2900,
    },
    {
      title: "Wendejacke – Punkte & Streifen",
      description: "Handgenähte Wendejacke, außen Punkte, innen Streifen. Mit Druckknöpfen, kein Reißverschluss.",
      variants: [{ title: "86-92 / 18-24 Monate", sku: "JACK-WEND-86" }],
      meta: {
        sizeLabel: "86-92",
        sizeCmMin: 86,
        sizeCmMax: 92,
        fabric: "Jersey-Baumwolle, ungefüttert",
        ageMonthsMin: 18,
        ageMonthsMax: 24,
        ageCategory: "toddler",
        careInstructions: "30°C Schonwaschgang",
      },
      priceEur: 5500,
    },
    {
      title: "Spielanzug mit Füßen – Sternchen",
      description: "Warmer Schlafanzug aus French-Terry, mit Füßen und Reißverschluss vorne. Handgenäht.",
      variants: [{ title: "98-104 / 3 Jahre", sku: "SLEEP-STERN-98" }],
      meta: {
        sizeLabel: "98-104",
        sizeCmMin: 98,
        sizeCmMax: 104,
        fabric: "French-Terry (80% Baumwolle, 20% Polyester)",
        ageMonthsMin: 30,
        ageMonthsMax: 42,
        ageCategory: "child",
        careInstructions: "40°C, Trockner geeignet",
      },
      priceEur: 4800,
    },
  ]

  let createdCount = 0
  let skippedCount = 0
  for (const p of products) {
    // Per-product idempotency: if every SKU for this product already exists,
    // skip it. The CEO's existing 2 products are kept intact; only the missing
    // 3 (Musselinhose, Wendejacke, Spielanzug) get created on re-run.
    if (p.variants.every((v) => existingSkus.has(v.sku))) {
      logger.info(`Skipping ${p.title} — all SKUs already exist (${p.variants.map((v) => v.sku).join(", ")})`)
      skippedCount++
      continue
    }
    try {
    logger.info(`Creating product: ${p.title}`)

    // 1. Create core Medusa product with variants (stock=1 each — handmade one-offs).
    // status: "published" so the storefront sees it without manual admin action.
    const [product] = await productModule.createProducts([
      {
        title: p.title,
        description: p.description,
        status: "published",
        variants: p.variants.map((v) => ({
          title: v.title,
          sku: v.sku,
          manage_inventory: true,
        })),
      },
    ])

    // Link product to Online Store sales channel so /store/products returns it.
    if (onlineStore) {
      try {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: onlineStore.id },
        })
      } catch (err) {
        logger.warn(`Sales channel link for ${p.title} failed (non-fatal): ${err}`)
      }
    }

    // 2. Attach Binchen catalog metadata (non-fatal if catalog module unavailable)
    if (catalogModule) {
      try {
        await catalogModule.createProductMetadatas([
          {
            productId: product.id,
            ...p.meta,
          },
        ])
      } catch (err) {
        logger.warn(`Catalog metadata for ${p.title} failed (non-fatal): ${err}`)
      }
    }

    // 3. Create inventory items and set quantity=1 for each variant
    for (const variant of product.variants ?? []) {
      const [inventoryItem] = await inventoryModule.createInventoryItems([
        {
          sku: variant.sku,
          title: `${product.title} — ${variant.title}`,
        },
      ])

      // Link variant → inventory item via remote link (Medusa v2 cross-module association)
      await remoteLink.create({
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.INVENTORY]: { inventory_item_id: inventoryItem.id },
      })

      // Set stock=1 at the atelier location
      await inventoryModule.createInventoryLevels([
        {
          inventory_item_id: inventoryItem.id,
          location_id: stockLocation.id,
          stocked_quantity: 1,
        },
      ])
    }

    // 4. Create price set for the product
    const [priceSet] = await pricingModule.createPriceSets([
      {
        prices: [
          {
            amount: p.priceEur,
            currency_code: EUR,
          },
        ],
      },
    ])

    // Link each variant → price set via remote link (Medusa v2 cross-module association)
    for (const variant of product.variants ?? []) {
      await remoteLink.create({
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.PRICING]: { price_set_id: priceSet.id },
      })
    }
    createdCount++
    } catch (err) {
      // Per-product try/catch so one failure doesn't abort the rest of the catalog.
      logger.error(`Failed to create product "${p.title}" (continuing): ${err}`)
    }
  }

  logger.info(`Seeded ${createdCount}/${products.length} products (${skippedCount} skipped, already existed).`)
}
