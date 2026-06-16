import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { CATALOG_MODULE } from "../../../modules/catalog"

// GET /store/products
// Storefront product list with Binchen-specific filters.
// See: BIL-3 API contract document for full shape.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    size,          // exact sizeLabel match, e.g. "56" or "62-68"
    fabric,        // partial match on fabric string
    age_category,  // "newborn" | "baby" | "toddler" | "child"
    age_min,       // age lower bound in months (inclusive)
    age_max,       // age upper bound in months (inclusive)
    limit = "20",
    offset = "0",
  } = req.query as Record<string, string>

  const productModule = req.scope.resolve(Modules.PRODUCT)
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
    productIds = metas.map((m) => m.productId)
    if (productIds.length === 0) {
      return res.json({ products: [], count: 0, limit: Number(limit), offset: Number(offset) })
    }
  }

  const [products, count] = await productModule.listAndCountProducts(
    {
      status: ["published"],
      ...(productIds ? { id: productIds } : {}),
    },
    {
      select: ["id", "title", "description", "thumbnail", "variants"],
      relations: ["variants"],
      take: Number(limit),
      skip: Number(offset),
    }
  )

  // Attach metadata to each product (skip when catalog module is unavailable)
  const metaByProductId: Record<string, unknown> = catalogModule
    ? Object.fromEntries(
        (
          await catalogModule.listProductMetadatas(
            { productId: products.map((p) => p.id) },
            { select: ["productId", "sizeLabel", "fabric", "ageCategory", "ageMonthsMin", "ageMonthsMax", "careInstructions"] }
          )
        ).map((m: { productId: string }) => [m.productId, m])
      )
    : {}

  const result = products.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    thumbnail: product.thumbnail,
    variants: (product.variants ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      inventory_quantity: (v as any).inventory_quantity ?? 1,
    })),
    metadata: metaByProductId[product.id] ?? null,
  }))

  res.json({
    products: result,
    count,
    limit: Number(limit),
    offset: Number(offset),
  })
}
