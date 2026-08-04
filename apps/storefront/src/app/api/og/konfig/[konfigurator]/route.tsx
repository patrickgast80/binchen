import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import {
  KONFIG_REGISTRY,
  isKonfiguratorId,
  swatchHexOrDefault,
  swatchNameOrDefault,
} from "@/app/konfigurator/_shared/registry";

// Coolify serves Node runtimes reliably; edge is unnecessary for a route we
// hit only when a social preview is generated.
export const runtime = "nodejs";
export const revalidate = 3600;

const OG_W = 1200;
const OG_H = 630;

export async function GET(
  request: NextRequest,
  { params }: { params: { konfigurator: string } },
): Promise<Response> {
  if (!isKonfiguratorId(params.konfigurator)) {
    return new Response("unknown konfigurator", { status: 404 });
  }
  const konfig = KONFIG_REGISTRY[params.konfigurator];
  const search = request.nextUrl.searchParams;

  const swatches = konfig.regions.map((r) => ({
    label: r.label,
    hex: swatchHexOrDefault(search.get(r.param), r.defaultColor),
    name: swatchNameOrDefault(search.get(r.param), r.defaultColor),
  }));

  // Absolute URL so satori can fetch the base photo without an origin guess.
  const origin = request.nextUrl.origin;
  const basePhotoAbs = `${origin}${konfig.basePhoto}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: OG_W,
          height: OG_H,
          display: "flex",
          flexDirection: "row",
          backgroundColor: "#F0EBE1",
          color: "#2C2417",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Left: product photo panel */}
        <div
          style={{
            width: OG_W * 0.48,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FAF7F2",
            borderRight: "1px solid #E5DDD4",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={basePhotoAbs}
            alt=""
            width={480}
            height={Math.round((konfig.height / konfig.width) * 480)}
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Right: brand + color legend */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 64px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 20,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: "#7A3318",
                fontWeight: 500,
              }}
            >
              bilulu · Konfigurator
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                fontSize: 68,
                lineHeight: 1.05,
                fontWeight: 600,
                fontFamily: "serif",
                color: "#2C2417",
              }}
            >
              Meine {konfig.productLabel}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                fontSize: 26,
                lineHeight: 1.3,
                color: "#6B5E4E",
                maxWidth: 520,
              }}
            >
              Handgenäht in Deutschland — jede Zone einzeln einfärbbar.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {swatches.map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  fontSize: 26,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: s.hex,
                    border: "2px solid #E5DDD4",
                  }}
                />
                <div style={{ display: "flex", color: "#6B5E4E" }}>{s.label}:</div>
                <div style={{ display: "flex", color: "#2C2417", fontWeight: 600 }}>
                  {s.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: OG_W,
      height: OG_H,
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}
