import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const MAX_DIMENSION = 800
const WEBP_QUALITY = 0.80

// Fotos de candidato só aparecem em thumb: 224x120 no card do kanban (RH e DP),
// 32px no avatar de Colaboradores e ~80px no anexo do modal. 800px gerava ~46KB
// por foto pra exibir num espaço 7x menor — 480 cobre até tela 2x com folga.
export const PHOTO_MAX_DIMENSION = 480

interface UploadOptions {
  /** Maior lado da imagem depois da compressão. Default: MAX_DIMENSION (800). */
  maxDimension?: number
}

async function compressImage(file: File, maxDimension: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const { width, height } = img
      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('canvas toBlob failed'))),
        'image/webp',
        WEBP_QUALITY,
      )
    }
    img.onerror = reject
    img.src = objectUrl
  })
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File, folder?: string, options?: UploadOptions): Promise<string> => {
    setUploading(true)
    try {
      await supabase.auth.refreshSession()

      const compressed = await compressImage(file, options?.maxDimension ?? MAX_DIMENSION)
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`

      const formData = new FormData()
      formData.append('file', new File([compressed], fileName, { type: 'image/webp' }))
      if (folder) formData.append('folder', folder)

      const { data, error } = await supabase.functions.invoke('upload-product-image', {
        body: formData,
      })

      if (error) throw new Error(error.message || 'Upload falhou')
      if (!data?.url) throw new Error('Edge function não retornou URL')

      return data.url as string
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading }
}
