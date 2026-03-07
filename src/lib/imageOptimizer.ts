/**
 * Optimizes Supabase Storage image URLs by appending transform parameters.
 *
 * Supabase Storage supports on-the-fly image resizing via the
 * /render/image/... endpoint. For public URLs that contain
 * `/storage/v1/object/public/`, we swap to the render endpoint and
 * add width, quality, and format params.
 *
 * For any other URL (e.g. external), we return it as-is.
 */

interface ImageOptions {
    width?: number
    height?: number
    quality?: number
    /** resize mode: 'cover' (crop), 'contain' (fit), or 'fill' */
    resize?: 'cover' | 'contain' | 'fill'
}

const DEFAULTS: Required<Pick<ImageOptions, 'quality' | 'resize'>> = {
    quality: 75,
    resize: 'contain',
}

export function optimizeImage(
    url: string | null | undefined,
    options: ImageOptions = {}
): string {
    if (!url) return ''

    // Only transform Supabase storage URLs
    const publicSegment = '/storage/v1/object/public/'
    if (!url.includes(publicSegment)) return url

    // Build the render URL
    const renderUrl = url.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
    )

    const params = new URLSearchParams()
    if (options.width) params.set('width', String(options.width))
    if (options.height) params.set('height', String(options.height))
    params.set('quality', String(options.quality ?? DEFAULTS.quality))
    params.set('resize', options.resize ?? DEFAULTS.resize)

    return `${renderUrl}?${params.toString()}`
}

// Pre-configured sizes for common use-cases
export const img = {
    /** Carousel thumbnail (small card) – ~200px */
    thumbnail: (url: string | null | undefined) =>
        optimizeImage(url, { width: 200, quality: 70 }),

    /** Product card in carousel – ~400px */
    card: (url: string | null | undefined) =>
        optimizeImage(url, { width: 400, quality: 75 }),

    /** Package avatar circle – ~80px */
    avatar: (url: string | null | undefined) =>
        optimizeImage(url, { width: 80, quality: 70, resize: 'cover' }),

    /** Product detail modal – ~600px */
    detail: (url: string | null | undefined) =>
        optimizeImage(url, { width: 600, quality: 80 }),

    /** Admin table row – ~120px */
    adminRow: (url: string | null | undefined) =>
        optimizeImage(url, { width: 120, quality: 70 }),
}
