import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, QueryContext } from "@medusajs/framework/utils"
import { CATALOG_MODULE } from "../../../../modules/catalog"

// Fallback region if the storefront request omits region_id (DE / EUR).
const DEFAULT_REGION_ID = "reg_01KVFAA131VGWJ6DF74JBYRMTM"
const DEFAULT_CURRENCY = "eur"

// GET /store/products/:id
// Storefront single-product lookup. Overrides Medusa's stock handler because
// the stock handler runs the lookup through the store-side filterableFields
// (which include the publishable-key sales-channel filter). Catalog products
// are not assigned to a sales channel, so the stock handler 404s every PDP.
//
// Mirrors the list endpoint at ../route.ts: query.graph with pricing context,
// filter by status: "published", attach catalog metadata. No sales-channel
// filter. Each variant carries calculated_price for the requested region
// (BIL-2442).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { region_id } = req.query as Record<string, string>
  const regionId = region_id || DEFAULT_REGION_ID

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let catalogModule: any = null
  try {
    catalogModule = req.scope.resolve(CATALOG_MODULE)
  } catch {
    catalogModule = null
  }

  const { data: products = [] } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "thumbnail",
      "images.id",
      "images.url",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.inventory_quantity",
      "variants.calculated_price.*",
    ],
    filters: { id, status: "published" },
    pagination: { take: 1 },
    context: {
      variants: {
        calculated_price: QueryContext({
          region_id: regionId,
          currency_code: DEFAULT_CURRENCY,
        }),
      },
    },
  })

  const product = products[0]
  if (!product) {
    return res.status(404).json({
      type: "not_found",
      message: `Product ${id} not found`,
    })
  }

  const metadata = catalogModule
    ? (
        await catalogModule.listProductMetadatas(
          { productId: product.id },
          {
            select: [
              "productId",
              "sizeLabel",
              "fabric",
              "ageCategory",
              "ageMonthsMin",
              "ageMonthsMax",
              "careInstructions",
            ],
          }
        )
      )[0] ?? null
    : null

  res.json({
    product: {
      id: product.id,
      title: product.title,
      description: product.description,
      thumbnail: product.thumbnail,
      images: (product.images ?? []).map((img: { id?: string; url: string }) => ({
        id: img.id,
        url: img.url,
      })),
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
      metadata,
    },
  })
}
