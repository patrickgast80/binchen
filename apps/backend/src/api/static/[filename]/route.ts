import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import fs from "fs"
import path from "path"

// BIL-2434: Medusa v2 (file-local provider) writes uploads to disk but does not
// register any /static or /uploads HTTP route. Every image URL returned by
// upload therefore 404s in production. This route serves the missing static
// asset endpoint. It only reads from the on-disk `uploads/` directory, guards
// against `..`/path-traversal, and refuses anything that resolves outside the
// uploads root. Cache-Control is 24h — images are content-addressed by
// upload timestamp + original filename, so long-lived caching is safe.
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads")

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { filename } = req.params as { filename: string }

  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return res.status(400).json({ code: "invalid_filename", message: "Filename may not contain path separators" })
  }

  const safeName = path.basename(filename)
  const filePath = path.join(UPLOAD_DIR, safeName)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
    return res.status(400).json({ code: "invalid_filename", message: "Filename escapes uploads directory" })
  }

  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(resolved)
  } catch {
    return res.status(404).json({ code: "not_found", message: "File not found" })
  }
  if (!stat.isFile()) {
    return res.status(404).json({ code: "not_found", message: "File not found" })
  }

  const ext = path.extname(safeName).toLowerCase()
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream"

  res.setHeader("Content-Type", contentType)
  res.setHeader("Content-Length", stat.size.toString())
  res.setHeader("Cache-Control", "public, max-age=86400, immutable")

  const stream = fs.createReadStream(resolved)
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ code: "read_error", message: "Failed to read file" })
    } else {
      res.destroy()
    }
  })
  stream.pipe(res)
}
