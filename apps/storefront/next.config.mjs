import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Several agents share one checkout, so a running `next dev` regularly holds
  // `.next/` and makes a parallel `next build` die with EPERM on Windows.
  // `NEXT_DIST_DIR=.next-verify pnpm --filter=storefront build` gives that
  // build its own directory. Unset everywhere else, including Docker.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  // BIL-2526: die globalen Styles gehen im Production-Build inline in den <head>
  // (siehe src/components/layout/global-styles.prod.tsx). Im Dev bleibt der
  // normale CSS-Import, sonst waere HMR fuer Tailwind-Klassen kaputt.
  //
  // Nicht `experimental.optimizeCss`: critters haengt in Next 14.2 nur im
  // Pages-Router-Renderer und laesst App-Router-HTML unveraendert — nachgebaut,
  // gemessen, verworfen.
  // `BILULU_INLINE_CSS=0` ist der Notausstieg zurueck auf das verlinkte
  // Stylesheet — ohne Code zurueckzunehmen (RUNBOOK §Inline-CSS).
  //
  // Bewusst `NormalModuleReplacementPlugin` und nicht `resolve.alias`:
  // Next loest `@/...` ueber seinen eigenen `JsConfigPathsPlugin` in
  // `resolve.plugins` auf, der vor der Alias-Aufloesung greift. Ein Alias auf
  // `@/components/layout/global-styles$` wird deshalb still ignoriert — der
  // Build laeuft durch und nimmt trotzdem die falsche Variante. Nachgemessen:
  // ein Base-Build mit gesetztem Flag lieferte weiterhin 0 Stylesheet-Links.
  // Der Plugin-Weg arbeitet auf dem aufgeloesten Dateipfad und kann das nicht
  // verfehlen.
  webpack: (config, { dev, webpack }) => {
    if (dev || process.env.BILULU_INLINE_CSS === "0") {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]components[\\/]layout[\\/]global-styles\.inline\.tsx$/,
          path.join(__dirname, "src/components/layout/global-styles.linked.tsx")
        )
      );
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "binchen-backend.onrender.com",
      },
      {
        protocol: "https",
        hostname: "bilulu.de",
      },
      {
        // BIL-2432: product images live at https://api.bilulu.de/static/* (see
        // apps/backend/src/api/static/[filename]/route.ts). Without this
        // remotePattern, next/image 400s "url parameter is not allowed" and
        // the entire imported catalog renders as blank tiles.
        protocol: "https",
        hostname: "api.bilulu.de",
      },
      {
        protocol: "https",
        hostname: "binchen.vercel.app",
      },
    ],
    // BIL-2425: interim product placeholders under public/products/*.svg are
    // authored by us — script-sandboxed CSP keeps external SVG safe.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async redirects() {
    const redirects = [
      { source: "/warenkorb", destination: "/cart", permanent: true },
      { source: "/warenkorb/:path*", destination: "/cart/:path*", permanent: true },
    ];
    if (process.env.BILULU_CANONICAL_REDIRECT === "true") {
      redirects.push({
        source: "/:path*",
        has: [{ type: "host", value: "binchen.vercel.app" }],
        destination: "https://bilulu.de/:path*",
        permanent: true,
      });
    }
    return redirects;
  },
};

export default nextConfig;
