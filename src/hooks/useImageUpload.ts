import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useImageUpload() {
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File): Promise<string> => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = `products/${fileName}`

      const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { cacheControl: '31536000', upsert: false })

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
