import { Router, type Request, type Response } from 'express'
import { query } from '../db.js'
import { optionalAuth } from '../auth.js'

export const mediaRouter = Router()

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
  'image/gif',
])

// Maximum allowed image file size in bytes (2.5 MB)
const MAX_IMAGE_SIZE_BYTES = 2.5 * 1024 * 1024

// POST /api/media/upload - Store optimized WebP/PNG image in PostgreSQL BYTEA
mediaRouter.post('/upload', optionalAuth, async (req: Request, res: Response) => {
  try {
    const {
      data, // base64 string or data URL
      originalName,
      mimeType = 'image/webp',
      width,
      height,
    } = req.body || {}

    if (!data || typeof data !== 'string') {
      res.status(400).json({ error: 'Image data payload is required.' })
      return
    }

    // Parse base64 string (strip data URI prefix if present)
    let cleanBase64 = data
    let detectedMime = mimeType

    const dataUriMatch = data.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/)
    if (dataUriMatch) {
      detectedMime = dataUriMatch[1].toLowerCase()
      cleanBase64 = dataUriMatch[2]
    }

    if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
      res.status(400).json({
        error: `Invalid image format (${detectedMime}). Only WebP, JPEG, PNG, and GIF are supported.`,
      })
      return
    }

    const buffer = Buffer.from(cleanBase64, 'base64')
    if (buffer.length === 0) {
      res.status(400).json({ error: 'Invalid or empty image buffer.' })
      return
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      res.status(413).json({
        error: `Image exceeds maximum allowed size of 2.5MB (${(buffer.length / 1024 / 1024).toFixed(2)}MB).`,
      })
      return
    }

    const uploaderUserId = req.user?.id || null
    const uploaderWallet = (req.headers['x-wallet-address'] as string)?.toLowerCase() || null

    const insertRes = await query<{
      id: string
      mime_type: string
      size_bytes: number
      width: number | null
      height: number | null
      created_at: string
    }>(
      `
      INSERT INTO uploaded_images (
        uploader_user_id,
        uploader_wallet,
        original_name,
        mime_type,
        data,
        size_bytes,
        width,
        height
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, mime_type, size_bytes, width, height, created_at
      `,
      [
        uploaderUserId,
        uploaderWallet,
        originalName ? String(originalName).slice(0, 255) : null,
        detectedMime,
        buffer,
        buffer.length,
        width && Number.isInteger(Number(width)) ? Number(width) : null,
        height && Number.isInteger(Number(height)) ? Number(height) : null,
      ]
    )

    const row = insertRes.rows[0]

    res.status(201).json({
      success: true,
      id: row.id,
      url: `/api/media/${row.id}`,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
    })
  } catch (err) {
    console.error('[Media API] Upload failed:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/media/:id - Stream optimized image with caching headers
mediaRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Check ETag for 304 Not Modified
    const clientEtag = req.headers['if-none-match']
    const expectedEtag = `"${id}"`

    if (clientEtag === expectedEtag) {
      res.status(304).end()
      return
    }

    const result = await query<{
      mime_type: string
      data: Buffer
      size_bytes: number
      created_at: string
    }>(
      'SELECT mime_type, data, size_bytes, created_at FROM uploaded_images WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Image not found' })
      return
    }

    const row = result.rows[0]

    res.setHeader('Content-Type', row.mime_type)
    res.setHeader('Content-Length', row.size_bytes)
    res.setHeader('ETag', expectedEtag)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Last-Modified', new Date(row.created_at).toUTCString())

    res.end(row.data)
  } catch (err) {
    console.error('[Media API] Retrieval failed:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

