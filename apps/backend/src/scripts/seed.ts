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
  const catalogModule = container.resolve(CATALOG_MODULE)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const pricingModule = container.resolve(Modules.PRICING)

  logger.info("Seeding Binchen catalog...")

  // Create default sales channel
  const [salesChannel] = await salesChannelModule.createSalesChannels([
    { name: "Online Store" },
  ])

  // Create stock location (Binchen Atelier)
  const [stockLocation] = await stockLocationModule.createStockLocations([
    { name: "Binchen Atelier" },
  ])

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

  for (const p of products) {
    logger.info(`Creating product: ${p.title}`)

    // 1. Create core Medusa product with variants (stock=1 each — handmade one-offs)
    const [product] = await productModule.createProducts([
      {
        title: p.title,
        description: p.description,
        status: "draft",
        sales_channels: [{ id: salesChannel.id }],
        variants: p.variants.map((v) => ({
          title: v.title,
          sku: v.sku,
          manage_inventory: true,
        })),
      },
    ])

    // 2. Attach Binchen catalog metadata
    await catalogModule.createProductMetadatas([
      {
        productId: product.id,
        ...p.meta,
      },
    ])

    // 3. Create inventory items and set quantity=1 for each variant
    for (const variant of product.variants ?? []) {
      const [inventoryItem] = await inventoryModule.createInventoryItems([
        {
          sku: variant.sku,
          title: `${product.title} — ${variant.title}`,
        },
      ])

      // Link variant to inventory item
      await productModule.upsertProductVariants([
        {
          id: variant.id,
          inventory_items: [{ inventory_item_id: inventoryItem.id }],
        },
      ])

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

    // Link price set to variant
    for (const variant of product.variants ?? []) {
      await productModule.upsertProductVariants([
        {
          id: variant.id,
          price_set_id: priceSet.id,
        },
      ])
    }
  }

  logger.info(`Seeded ${products.length} products. Run 'medusa develop' to view in admin.`)
}
