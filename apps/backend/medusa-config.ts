import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
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
    // BIL-124 — Board pivot 2026-06-13: PayPal is the only payment method.
    // The payment module registers when both PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET
    // are present so dev/CI boots stay green when payments are unconfigured.
    // PAYPAL_MODE selects sandbox (default) or live; PAYPAL_WEBHOOK_ID gates
    // webhook signature verification.
    ...(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? [{
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            // Resolves to ./src/modules/payment-paypal at runtime. Registered
            // without an id so the Medusa provider key is `pp_paypal` and the
            // built-in webhook route exposes /hooks/payment/paypal.
            resolve: "./src/modules/payment-paypal",
            options: {
              clientId: process.env.PAYPAL_CLIENT_ID,
              clientSecret: process.env.PAYPAL_CLIENT_SECRET,
              mode: process.env.PAYPAL_MODE === "live" ? "live" : "sandbox",
              webhookId: process.env.PAYPAL_WEBHOOK_ID,
            },
          },
        ],
      },
    }] : []),
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
    // catalog module NOT registered: no migrations exist yet for the product_metadata
    // table, which causes db:migrate to fail at boot. Defensive seed (seed.ts) handles
    // the missing module gracefully — products get created without Binchen metadata.
    // TODO: generate migrations via `medusa db:generate catalog` and re-enable.
    {
      // BIL-32 transactional email (Brevo). Service degrades gracefully when
      // BREVO_API_KEY / BREVO_SENDER_EMAIL are unset so dev + CI boots stay green.
      resolve: "./src/modules/email",
      options: {
        apiKey: process.env.BREVO_API_KEY,
        senderEmail: process.env.BREVO_SENDER_EMAIL,
        senderName: process.env.BREVO_SENDER_NAME,
        adminEmail: process.env.BREVO_ADMIN_EMAIL,
      },
    },
  ],
})
