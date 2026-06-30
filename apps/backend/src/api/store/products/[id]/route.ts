import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { CATALOG_MODULE } from "../../../../modules/catalog"

// GET /store/products/:id
// Storefront single-product lookup. Overrides Medusa's stock handler because
// the stock handler runs the lookup through the store-side filterableFields
// (which include the publishable-key sales-channel filter). Catalog products
// are not assigned to a sales channel, so the stock handler 404s every PDP.
//
// This route mirrors the architectural choice already made by the list
// endpoint at ../route.ts: resolve Modules.PRODUCT directly, filter by
// status: "published", and attach catalog metadata. No sales-channel filter.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const productModule = req.scope.resolve(Modules.PRODUCT)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let catalogModule: any = null
  try {
    catalogModule = req.scope.resolve(CATALOG_MODULE)
  } catch {
    catalogModule = null
  }

  const products = await productModule.listProducts(
    { id, status: ["published"] },
    {
      select: ["id", "title", "description", "thumbnail"],
      relations: ["variants", "images"],
      take: 1,
    }
  )

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
      })),
      metadata,
    },
  })
}
