import { model } from "@medusajs/framework/utils"

// Extends Medusa's core product with Binchen-specific handmade metadata.
// Linked 1:1 to the core product via productId (Medusa core product ID).
const ProductMetadata = model.define("product_metadata", {
  id: model.id().primaryKey(),
  productId: model.text().unique(), // FK to Medusa core product
  // Size range this item fits (e.g. "56", "62-68", "86-92")
  sizeLabel: model.text().nullable(),
  // Numeric lower bound in cm for range queries
  sizeCmMin: model.number().nullable(),
  sizeCmMax: model.number().nullable(),
  // Primary fabric composition (e.g. "100% Bio-Baumwolle", "Jersey")
  fabric: model.text().nullable(),
  // Recommended age range in months (lower..upper)
  ageMonthsMin: model.number().nullable(),
  ageMonthsMax: model.number().nullable(),
  // Free-form care instructions
  careInstructions: model.text().nullable(),
  // e.g. "newborn", "baby", "toddler", "child"
  ageCategory: model.enum(["newborn", "baby", "toddler", "child"]).nullable(),
})

export default ProductMetadata
