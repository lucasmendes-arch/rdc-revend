import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const MAX_DIMENSION = 800
const JPEG_QUALITY = 0.75

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const { width, height } = img
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    }
    img.onerror = reject
    img.src = objectUrl
  })
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File): Promise<string> => {
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const filePath = `products/${fileName}`

      const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, compressed, { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' })

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)

      return urlData.publicUrl
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading }
}
