import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function diagnosis() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  DIAGNÓSTICO COMPLETO DO CATÁLOGO                 ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  // 1. Teste de conexão
  console.log('📡 1. TESTE DE CONEXÃO SUPABASE')
  console.log('─'.repeat(50))
  try {
    const { data, error } = await supabase.auth.getSession()
    console.log('✅ Conectado ao Supabase\n')
  } catch (err) {
    console.error('❌ Erro de conexão:', err.message)
    return
  }

  // 2. Verificar RLS
  console.log('🔐 2. VERIFICAR RLS POLICIES')
  console.log('─'.repeat(50))
  try {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('count(*)', { count: 'exact' })

    if (error) {
      console.error('❌ Erro ao acessar catalog_products:', error.message)
      console.log('   Tipo de erro:', error.code)
    } else {
      console.log('✅ RLS Policy funcionando\n')
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 3. Verificar dados
  console.log('📦 3. VERIFICAR DADOS NA TABELA')
  console.log('─'.repeat(50))
  try {
    const { data: allProducts, error: allError } = await supabase
      .from('catalog_products')
      .select('*')

    if (allError) {
      console.error('❌ Erro ao buscar produtos:', allError.message)
    } else {
      console.log(`✅ Total de produtos: ${allProducts.length}`)

      const active = allProducts.filter(p => p.is_active).length
      console.log(`   → Ativos (is_active=true): ${active}`)
      console.log(`   → Inativos: ${allProducts.length - active}\n`)

      if (allProducts.length === 0) {
        console.log('⚠️  AVISO: Tabela vazia!')
        console.log('   → Você precisa sincronizar com Nuvemshop\n')
      } else {
        console.log('   Primeiros 3 produtos:')
        allProducts.slice(0, 3).forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.name} (ID: ${p.nuvemshop_product_id})`)
        })
        console.log('')
      }
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 4. Testar query exata do hook
  console.log('🪝 4. TESTAR QUERY EXATA DO HOOK')
  console.log('─'.repeat(50))
  try {
    const { data: hookData, error: hookError } = await supabase
      .from('catalog_products')
      .select('id, name, main_image, price, compare_at_price, description_html')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    if (hookError) {
      console.error('❌ Erro na query do hook:', hookError.message)
    } else {
      console.log(`✅ Query do hook retornou: ${hookData.length} produtos\n`)
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 5. Verificar sync runs
  console.log('🔄 5. VERIFICAR HISTÓRICO DE SINCRONIZAÇÃO')
  console.log('─'.repeat(50))
  try {
    const { data: syncRuns, error: syncError } = await supabase
      .from('catalog_sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(3)

    if (syncError) {
      console.error('❌ Erro ao buscar sync runs:', syncError.message)
    } else {
      if (syncRuns.length === 0) {
        console.log('⚠️  Nenhuma sincronização realizada ainda')
        console.log('   → Acesse /admin/catalogo e clique "Sincronizar agora"\n')
      } else {
        console.log(`✅ ${syncRuns.length} sincronizações encontradas:\n`)
        syncRuns.forEach((run, i) => {
          console.log(`${i + 1}. Status: ${run.status}`)
          console.log(`   Data: ${new Date(run.started_at).toLocaleString()}`)
          console.log(`   Importados: ${run.imported}, Atualizados: ${run.updated}, Erros: ${run.errors}`)
          if (run.error_message) {
            console.log(`   Erro: ${run.error_message}`)
          }
          console.log('')
        })
      }
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 6. Testar edge function
  console.log('⚡ 6. TESTAR EDGE FUNCTION')
  console.log('─'.repeat(50))
  try {
    const { data: session, error: sessionError } = await supabase.auth.getSession()

    if (!session.session) {
      console.log('⚠️  Nenhuma sessão ativa (você não está logado)')
      console.log('   → Edge function só funciona autenticado\n')
    } else {
      console.log('ℹ️  Testando edge function com autenticação...')
      const response = await fetch(
        `${supabaseUrl}/functions/v1/sync-nuvemshop`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json()

      if (!response.ok) {
        console.error('❌ Erro na edge function:', result.error)
      } else {
        console.log('✅ Edge function retornou:')
        console.log(`   Importados: ${result.result.imported}`)
        console.log(`   Atualizados: ${result.result.updated}`)
        console.log(`   Total: ${result.result.total}`)
        if (result.result.errors > 0) {
          console.log(`   ❌ Erros: ${result.result.errors}`)
          console.log(`   Mensagens: ${result.result.errorMessages.join(', ')}`)
        }
        console.log('')
      }
    }
  } catch (err) {
    console.error('❌ Erro ao testar edge function:', err.message)
  }

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  FIM DO DIAGNÓSTICO                               ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

diagnosis().catch(console.error)
