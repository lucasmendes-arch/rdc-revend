import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Upload de arquivo genérico (ex: currículo em PDF) via mesma edge function
// de imagens — sem compressão, sobe o arquivo original.
export function useFileUpload() {
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File, folder?: string): Promise<string> => {
    setUploading(true)
    try {
      await supabase.auth.refreshSession()

      const formData = new FormData()
      formData.append('file', file)
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
