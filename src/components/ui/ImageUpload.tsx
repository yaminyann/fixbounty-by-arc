import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiUploadImage } from '@/lib/api'

interface ImageUploadProps {
  value?: string | null
  onChange: (url: string) => void
  maxDimensions?: { width: number; height: number }
  quality?: number
  label?: string
  helperText?: string
  aspectRatio?: 'video' | 'square' | 'auto'
  disabled?: boolean
}

/**
 * Resizes an image file and converts it to WebP format using HTML5 Canvas.
 * Significantly compresses oversized images before transmission and database storage.
 */
async function compressImageToWebp(
  file: File,
  maxWidth = 1280,
  maxHeight = 800,
  quality = 0.82
): Promise<{ dataUri: string; width: number; height: number; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to load image element.'))
      img.onload = () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        // Downscale while preserving aspect ratio if exceeding max limits
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D context is unavailable.'))
          return
        }

        // Use high-quality bicubic interpolation
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('WebP compression failed.'))
              return
            }
            const blobReader = new FileReader()
            blobReader.onloadend = () => {
              resolve({
                dataUri: blobReader.result as string,
                width,
                height,
                sizeBytes: blob.size,
              })
            }
            blobReader.readAsDataURL(blob)
          },
          'image/webp',
          quality
        )
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function ImageUpload({
  value,
  onChange,
  maxDimensions = { width: 1280, height: 800 },
  quality = 0.82,
  label = 'Cover Image',
  helperText = 'Recommended: 1200×630px. High-res images are automatically converted to optimized WebP.',
  aspectRatio = 'video',
  disabled = false,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number>(0)
  const [metaInfo, setMetaInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleProcessFile = async (file: File) => {
    // 1. Validate MIME type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validMimes.includes(file.type)) {
      toast.error('Invalid file format. Please upload JPEG, PNG, WebP, or GIF.')
      return
    }

    // 2. Initial size check (max 10MB raw)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit.')
      return
    }

    try {
      setUploading(true)
      setProgress(25)

      // 3. Client-side Canvas downsampling & WebP conversion
      const compressed = await compressImageToWebp(
        file,
        maxDimensions.width,
        maxDimensions.height,
        quality
      )

      setProgress(60)

      // 4. Upload optimized binary to PostgreSQL
      const result = await apiUploadImage(compressed.dataUri, {
        originalName: file.name,
        mimeType: 'image/webp',
        width: compressed.width,
        height: compressed.height,
      })

      setProgress(100)
      onChange(result.url)
      setMetaInfo(
        `${compressed.width}×${compressed.height} • ${(compressed.sizeBytes / 1024).toFixed(1)} KB WebP`
      )
      toast.success('Image optimized and uploaded successfully!')
    } catch (err) {
      console.error('[ImageUpload] Error:', err)
      toast.error((err as Error).message || 'Failed to process and upload image.')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) void handleProcessFile(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleProcessFile(file)
    // Reset file input so user can pick same file again if desired
    e.target.value = ''
  }

  const handleRemove = () => {
    onChange('')
    setMetaInfo(null)
  }

  const aspectClass =
    aspectRatio === 'video'
      ? 'aspect-[16/9]'
      : aspectRatio === 'square'
      ? 'aspect-square max-w-[200px]'
      : 'min-h-[160px]'

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold uppercase tracking-wider text-black">
            {label}
          </label>
          {metaInfo && (
            <span className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 border border-gray-300">
              {metaInfo}
            </span>
          )}
        </div>
      )}

      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className="hidden"
      />

      {value ? (
        /* Image Preview Box */
        <div className="relative border-2 border-black bg-white shadow-[4px_4px_0px_black] overflow-hidden group">
          <div className={`${aspectClass} w-full bg-gray-100 flex items-center justify-center overflow-hidden`}>
            <img
              src={value}
              alt="Uploaded preview"
              className="w-full h-full object-cover transition-transform group-hover:scale-[1.02] duration-200"
              onError={(e) => {
                // Fallback icon if broken URL
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
          </div>

          {/* Action Overlay */}
          <div className="p-3 bg-white border-t-2 border-black flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-mono font-medium truncate text-gray-600">
              <CheckCircle2 size={14} className="text-green-600 shrink-0" />
              <span className="truncate">{value}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
                className="px-2.5 py-1 text-xs font-bold border border-black bg-white hover:bg-yellow-300 transition-colors"
              >
                Change
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || uploading}
                className="px-2.5 py-1 text-xs font-bold border border-black bg-red-100 hover:bg-red-200 text-red-800 transition-colors flex items-center gap-1"
                title="Remove image"
              >
                <X size={12} />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Drop Zone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed transition-all p-6 text-center cursor-pointer select-none flex flex-col items-center justify-center gap-2 ${aspectClass} ${
            isDragging
              ? 'border-black bg-yellow-100 scale-[0.99]'
              : 'border-black bg-white hover:bg-yellow-50 hover:border-solid shadow-[3px_3px_0px_black]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 size={24} className="animate-spin text-black" />
              <span className="text-xs font-bold">Compressing & Uploading to PostgreSQL…</span>
              <div className="w-48 h-2 bg-gray-200 border border-black overflow-hidden mt-1">
                <div
                  className="h-full bg-yellow-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-none bg-yellow-300 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_black]">
                <Upload size={18} />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-black">
                  Click to upload <span className="font-normal text-gray-600">or drag and drop</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  WebP, PNG, JPEG or GIF (up to 10MB)
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {helperText && (
        <p className="text-[11px] text-gray-500 leading-normal">
          {helperText}
        </p>
      )}
    </div>
  )
}

