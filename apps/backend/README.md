# Binchen Backend — MedusaJS v2

Commerce backend for the Binchen handmade baby & children's clothing web shop.

## Prerequisites

- Node.js >= 20
- PostgreSQL 15+ (provisioned by DevOps — see BIL-2)
- (Optional) Redis for job queues

## Quick start

```bash
cp .env.template .env
# Fill in DATABASE_URL and secrets (get from DevOps vault)

npm install
npm run migrate
npm run seed
npm run dev
```

Admin panel: http://localhost:7001  
Storefront API: http://localhost:9000/store

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Medusa in development mode with hot reload |
| `npm run build` | Compile for production |
| `npm run start` | Start compiled production server |
| `npm run migrate` | Apply database migrations |
| `npm run seed` | Load placeholder catalog (5 products, stock=1 each) |

## Module structure

```
src/
  modules/
    catalog/          # Custom Binchen metadata (size/fabric/age)
      models/         # ProductMetadata data model
      service.ts      # MedusaService CRUD
      index.ts        # Module registration
  api/
    store/
      products/       # GET /store/products with filter params
  scripts/
    seed.ts           # Placeholder catalog seed
```

## Environment variables

See `.env.template`. All secrets must be stored in the DevOps vault, never committed.

## Payment providers

- **Stripe**: `@medusajs/payment-stripe` (sandbox until QA sign-off)
- **PayPal**: `@medusajs/payment-paypal` (sandbox until QA sign-off)
- **Klarna**: wired in Week 3

## Rollback

To roll back the last migration: `medusa db:rollback`  
To reset the database in dev: `medusa db:reset` (dev only, destroys all data)
