import { MedusaService } from "@medusajs/framework/utils"
import ProductMetadata from "./models/product-metadata"

class CatalogModuleService extends MedusaService({ ProductMetadata }) {}

export default CatalogModuleService
