import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkStatus() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  VERIFICAÇÃO DE STATUS ADMIN                      ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  // 1. Check who is logged in
  console.log('👤 1. VERIFICANDO USUÁRIO ATUAL')
  console.log('─'.repeat(50))
  try {
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      console.error('❌ Erro ao buscar sessão:', error.message)
      return
    }

    if (!session) {
      console.log('⚠️  Nenhum usuário logado no navegador')
      console.log('   → Faça login em http://localhost:8081/login\n')
      return
    }

    const email = session.user.email
    const userId = session.user.id
    console.log(`✅ Usuário logado: ${email}`)
    console.log(`   ID: ${userId}\n`)

    // 2. Check if this user is admin
    console.log('👑 2. VERIFICANDO ROLE DO USUÁRIO')
    console.log('─'.repeat(50))
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      if (profileError) {
        console.error('❌ Erro ao buscar profile:', profileError.message)
      } else {
        const role = profile?.role || 'user'
        if (role === 'admin') {
          console.log(`✅ Você é ADMIN!\n`)
        } else {
          console.log(`❌ Você é: ${role}`)
          console.log('   → Você não é admin, não pode acessar /admin/catalogo\n')
          console.log('   → Para tornar admin, execute no SQL Editor do Supabase:')
          console.log(`   UPDATE public.profiles SET role = 'admin' WHERE id = '${userId}';\n`)
        }
      }
    } catch (err) {
      console.error('❌ Erro:', err.message)
    }

  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 3. Check products in table
  console.log('📦 3. PRODUTOS NO CATÁLOGO')
  console.log('─'.repeat(50))
  try {
    const { data: products, error: productsError } = await supabase
      .from('catalog_products')
      .select('*', { count: 'exact' })

    if (productsError) {
      console.error('❌ Erro ao buscar produtos:', productsError.message)
    } else {
      console.log(`Total: ${products.length} produtos`)
      if (products.length === 0) {
        console.log('⚠️  CATÁLOGO VAZIO!')
        console.log('   → Nenhum produto foi sincronizado da Nuvemshop\n')
      } else {
        console.log(`   Ativos: ${products.filter(p => p.is_active).length}`)
        console.log(`   Inativos: ${products.filter(p => !p.is_active).length}\n`)
      }
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 4. Check sync history
  console.log('🔄 4. HISTÓRICO DE SINCRONIZAÇÃO')
  console.log('─'.repeat(50))
  try {
    const { data: syncRuns, error: syncError } = await supabase
      .from('catalog_sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(5)

    if (syncError) {
      console.error('❌ Erro ao buscar sync runs:', syncError.message)
    } else {
      if (syncRuns.length === 0) {
        console.log('⚠️  Nenhuma sincronização foi executada ainda')
        console.log('   → Acesse /admin/catalogo e clique "Sincronizar agora"\n')
      } else {
        console.log(`${syncRuns.length} sincronizações encontradas:\n`)
        syncRuns.forEach((run, i) => {
          const status = run.status === 'success' ? '✅' : run.status === 'error' ? '❌' : '⏳'
          console.log(`${i + 1}. ${status} ${run.status.toUpperCase()}`)
          console.log(`   Data: ${new Date(run.started_at).toLocaleString('pt-BR')}`)
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

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  FIM DA VERIFICAÇÃO                               ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

checkStatus().catch(console.error)
