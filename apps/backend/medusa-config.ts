import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      port: process.env.PORT ? Number(process.env.PORT) : 9000,
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7001",
      authCors: process.env.AUTH_CORS || "http://localhost:3000,http://localhost:7001",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    // Disabled for free-tier Docker builds: Vite processes 3800+ dashboard chunks and
    // hits EMFILE/OOM on Render 512 MB. Re-enable on a paid tier or via a separate
    // admin-only build. Store API is fully operational without the admin UI.
    disable: true,
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  modules: [
    // Stripe is a payment provider — must live inside the payment module, not as a top-level module
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_SECRET_KEY,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
              capture: false,
            },
          },
        ],
      },
    },
    // file-local is a file provider — override to pass custom upload_dir and backend_url
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "uploads",
              backend_url: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
            },
          },
        ],
      },
    },
    // fulfillment-manual: removed — already included by default as @medusajs/medusa/fulfillment-manual
    // catalog module is auto-discovered from src/modules/catalog by Medusa v2
  ],
})
