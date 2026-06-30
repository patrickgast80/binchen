import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// BIL-2386 — Seed Medusa inventory levels so the storefront stops rendering the
// sold-out branch on every PDP.
//
// Two things must be true for /store/products to return inventory_quantity > 0:
//
//   (a) every variant.inventory_item has an inventory_level at some location, and
//   (b) that location is linked to the sales channel that the storefront's
//       publishable API key authenticates against.
//
// The original seed.ts creates inventory_items + levels (qty 1) but never linked
// the "Binchen Atelier" stock location to the "Online Store" sales channel, so
// the storefront could never count it and reported 0 everywhere.
//
// This script is idempotent. Run with:
//   medusa exec ./src/scripts/seed-inventory.ts
//
// Optional env override: SEED_INVENTORY_QTY (default 50, in the 25–100 range
// recommended by BIL-2386).
const DEFAULT_QTY = 50
const STOCK_LOCATION_NAME = "Binchen Atelier"
const SALES_CHANNEL_NAME = "Online Store"

export default async function seedInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK) as any

  const targetQty = Number(process.env.SEED_INVENTORY_QTY) || DEFAULT_QTY
  logger.info(`Seeding inventory levels @ ${targetQty} units per variant.`)

  // 1. Find (or create) the Online Store sales channel.
  let onlineStore: { id: string } | null = null
  const channels = await salesChannelModule.listSalesChannels({ name: SALES_CHANNEL_NAME })
  if (channels && channels.length > 0) {
    onlineStore = channels[0]
  } else {
    const [created] = await salesChannelModule.createSalesChannels([{ name: SALES_CHANNEL_NAME }])
    onlineStore = created
    logger.info(`Created sales channel "${SALES_CHANNEL_NAME}" id=${created.id}`)
  }

  // 2. Find (or create) the Binchen Atelier stock location.
  let stockLocation: { id: string }
  const locations = await stockLocationModule.listStockLocations({ name: STOCK_LOCATION_NAME })
  if (locations && locations.length > 0) {
    stockLocation = locations[0]
  } else {
    const [created] = await stockLocationModule.createStockLocations([
      { name: STOCK_LOCATION_NAME },
    ])
    stockLocation = created
    logger.info(`Created stock location "${STOCK_LOCATION_NAME}" id=${created.id}`)
  }

  // 3. Link the stock location to the Online Store sales channel. This is the
  //    fix that turns variant.inventory_quantity from 0 → real numbers on the
  //    storefront. Idempotent: re-linking throws → swallow.
  try {
    await remoteLink.create({
      [Modules.SALES_CHANNEL]: { sales_channel_id: onlineStore.id },
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    })
    logger.info(
      `Linked sales channel ${onlineStore.id} <-> stock location ${stockLocation.id}`,
    )
  } catch (err) {
    logger.info(`Sales channel <-> stock location link already exists (ok): ${err}`)
  }

  // 4. Enumerate every variant and its currently linked inventory item(s).
  //    We use the query graph because the variant<->inventory_item relation is
  //    a remote-link, not a column on product_variant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variantGraph: { data: any[] } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "sku",
      "title",
      "manage_inventory",
      "product.id",
      "product.title",
      "inventory_items.inventory.id",
    ],
  })
  const variants = variantGraph.data ?? []
  logger.info(`Found ${variants.length} variants in catalog.`)

  let levelsCreated = 0
  let levelsUpdated = 0
  let inventoryItemsCreated = 0
  let skippedUnmanaged = 0

  for (const variant of variants) {
    if (!variant.manage_inventory) {
      skippedUnmanaged++
      continue
    }

    // 4a. If the variant has no inventory_item linked, create one + link it.
    //     The original seed creates this on first run, but defensive code here
    //     means a partially-seeded variant can be repaired without a full reseed.
    let inventoryItemIds: string[] = (variant.inventory_items ?? [])
      .map((ii: { inventory?: { id?: string } }) => ii?.inventory?.id)
      .filter((id: string | undefined): id is string => Boolean(id))

    if (inventoryItemIds.length === 0) {
      const [created] = await inventoryModule.createInventoryItems([
        {
          sku: variant.sku ?? `${variant.id}-inv`,
          title: `${variant.product?.title ?? "Product"} — ${variant.title ?? variant.id}`,
        },
      ])
      await remoteLink.create({
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.INVENTORY]: { inventory_item_id: created.id },
      })
      inventoryItemIds = [created.id]
      inventoryItemsCreated++
      logger.info(
        `Created inventory_item ${created.id} for variant ${variant.id} (${variant.sku ?? "no-sku"})`,
      )
    }

    // 4b. For each inventory item, upsert the stocked_quantity at the Atelier
    //     location.
    for (const invId of inventoryItemIds) {
      const existing = await inventoryModule.listInventoryLevels({
        inventory_item_id: invId,
        location_id: stockLocation.id,
      })

      if (existing && existing.length > 0) {
        await inventoryModule.updateInventoryLevels([
          {
            id: existing[0].id,
            inventory_item_id: invId,
            location_id: stockLocation.id,
            stocked_quantity: targetQty,
          },
        ])
        levelsUpdated++
      } else {
        await inventoryModule.createInventoryLevels([
          {
            inventory_item_id: invId,
            location_id: stockLocation.id,
            stocked_quantity: targetQty,
          },
        ])
        levelsCreated++
      }
    }
  }

  logger.info(
    `Inventory seed done: ${levelsCreated} level(s) created, ${levelsUpdated} updated, ` +
      `${inventoryItemsCreated} inventory_item(s) backfilled, ` +
      `${skippedUnmanaged} variant(s) skipped (manage_inventory=false).`,
  )

  // 5. Verification: count how many distinct products now have ≥1 variant with
  //    inventory_quantity > 0 from the storefront's perspective. This mirrors
  //    the done-criteria probe from BIL-2386.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stockedGraph: { data: any[] } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.inventory_quantity"],
  })
  const stockedProducts = (stockedGraph.data ?? []).filter((p) =>
    (p.variants ?? []).some(
      (v: { inventory_quantity?: number }) => (v.inventory_quantity ?? 0) > 0,
    ),
  )
  logger.info(
    `Post-seed: ${stockedProducts.length}/${stockedGraph.data?.length ?? 0} products have at least one variant with inventory_quantity > 0.`,
  )
  for (const p of stockedProducts) {
    const max = Math.max(
      ...(p.variants ?? []).map(
        (v: { inventory_quantity?: number }) => v.inventory_quantity ?? 0,
      ),
    )
    logger.info(`  ✓ ${p.id} "${p.title}" — max inventory_quantity = ${max}`)
  }

  const unstocked = (stockedGraph.data ?? []).filter(
    (p) =>
      !(p.variants ?? []).some(
        (v: { inventory_quantity?: number }) => (v.inventory_quantity ?? 0) > 0,
      ),
  )
  for (const p of unstocked) {
    logger.warn(`  ✗ ${p.id} "${p.title}" — still 0 across all variants`)
  }
}
