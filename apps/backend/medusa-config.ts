import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    // BIL-2175: deployed container hung in epoll_wait after first SELECT EXISTS roundtrip
    // when running db:migrate against the Coolify-managed Postgres. Medusa's pg wrapper
    // already sets keepAlive=true with a 10s initial delay; here we tighten that to 1s
    // so TCP keepalive probes fire before any NAT/proxy idle timeout (Hetzner/Coolify
    // overlay networks have been observed dropping idle flows in <30s), and bound any
    // single idle transaction at 60s so a stuck migration surfaces as an error instead
    // of an indefinite stall. Enable BACKEND_DB_LOGGING=true to log SQL via Medusa.
    databaseLogging: process.env.BACKEND_DB_LOGGING === "true",
    databaseDriverOptions: {
      keepAlive: true,
      keepAliveInitialDelayMillis: 1000,
      connectionTimeoutMillis: 10000,
      idle_in_transaction_session_timeout: 60000,
    },
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
    // BIL-2394 — Payment module is always registered so the built-in system
    // provider (`pp_system_default`) is available as the offline/Vorkasse
    // fallback whenever PayPal is not configured. PayPal is layered in on top
    // as a custom provider (`pp_paypal`) when both PAYPAL_CLIENT_ID +
    // PAYPAL_CLIENT_SECRET are set. PAYPAL_MODE selects sandbox (default) or
    // live; PAYPAL_WEBHOOK_ID gates webhook signature verification.
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          ...(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? [{
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
          }] : []),
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
