import { Module } from "@medusajs/framework/utils"
import EmailModuleService from "./service"

export const EMAIL_MODULE = "email"

export default Module(EMAIL_MODULE, {
  service: EmailModuleService,
})

export { EmailModuleService }
export type { OrderEmailPayload } from "./templates"
