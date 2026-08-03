import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, QueryContext } from "@medusajs/framework/utils"
import { CATALOG_MODULE } from "../../../modules/catalog"

// Fallback region if the storefront request omits region_id (DE / EUR).
// Storefront always sends it, but the override must not 500 without it.
const DEFAULT_REGION_ID = "reg_01KVFAA131VGWJ6DF74JBYRMTM"
const DEFAULT_CURRENCY = "eur"

// GET /store/products
// Storefront product list with Binchen-specific filters.
// Uses query.graph with pricing context so each variant carries
// calculated_price (see BIL-2442). No sales-channel filter — catalog
// products are not assigned to a sales channel by design (BIL-2438).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    size,          // exact sizeLabel match, e.g. "56" or "62-68"
    fabric,        // partial match on fabric string
    age_category,  // "newborn" | "baby" | "toddler" | "child"
    age_min,       // age lower bound in months (inclusive)
    age_max,       // age upper bound in months (inclusive)
    region_id,
    limit = "20",
    offset = "0",
  } = req.query as Record<string, string>

  const regionId = region_id || DEFAULT_REGION_ID

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  // Catalog module is registered only when the product_metadata migrations exist
  // (see medusa-config.ts). Resolve defensively so /store/products keeps returning
  // products — without metadata — when the module is intentionally absent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let catalogModule: any = null
  try {
    catalogModule = req.scope.resolve(CATALOG_MODULE)
  } catch {
    catalogModule = null
  }

  // Build metadata filter
  const metaFilter: Record<string, unknown> = {}
  if (size) metaFilter.sizeLabel = size
  if (fabric) metaFilter.fabric = { $ilike: `%${fabric}%` }
  if (age_category) metaFilter.ageCategory = age_category
  if (age_min) metaFilter.ageMonthsMax = { $gte: Number(age_min) }
  if (age_max) metaFilter.ageMonthsMin = { $lte: Number(age_max) }

  // Metadata filters require the catalog module. If filters are requested but
  // catalog is unavailable, return an empty page rather than 500-ing.
  if (Object.keys(metaFilter).length > 0 && !catalogModule) {
    return res.json({ products: [], count: 0, limit: Number(limit), offset: Number(offset) })
  }

  // Get matching productIds from catalog metadata
  let productIds: string[] | undefined
  if (Object.keys(metaFilter).length > 0 && catalogModule) {
    const metas = await catalogModule.listProductMetadatas(metaFilter, {
      select: ["productId"],
    })
    productIds = metas.map((m: { productId: string }) => m.productId)
    if (productIds.length === 0) {
      return res.json({ products: [], count: 0, limit: Number(limit), offset: Number(offset) })
    }
  }

  const { data: products = [], metadata } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "thumbnail",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.inventory_quantity",
      "variants.calculated_price.*",
    ],
    filters: {
      status: "published",
      ...(productIds ? { id: productIds } : {}),
    },
    pagination: { skip: Number(offset), take: Number(limit) },
    context: {
      variants: {
        calculated_price: QueryContext({
          region_id: regionId,
          currency_code: DEFAULT_CURRENCY,
        }),
      },
    },
  })

  // Attach metadata to each product (skip when catalog module is unavailable)
  const metaByProductId: Record<string, unknown> = catalogModule
    ? Object.fromEntries(
        (
          await catalogModule.listProductMetadatas(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { productId: products.map((p: any) => p.id) },
            { select: ["productId", "sizeLabel", "fabric", "ageCategory", "ageMonthsMin", "ageMonthsMax", "careInstructions"] }
          )
        ).map((m: { productId: string }) => [m.productId, m])
      )
    : {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = products.map((product: any) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    thumbnail: product.thumbnail,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants: (product.variants ?? []).map((v: any) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      inventory_quantity: v.inventory_quantity ?? 1,
      calculated_price: v.calculated_price
        ? {
            calculated_amount: v.calculated_price.calculated_amount,
            currency_code: v.calculated_price.currency_code,
          }
        : null,
    })),
    metadata: metaByProductId[product.id] ?? null,
  }))

  res.json({
    products: result,
    count: metadata?.count ?? result.length,
    limit: Number(limit),
    offset: Number(offset),
  })
}
