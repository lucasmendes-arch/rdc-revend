import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function verify() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  VERIFICAÇÃO DE SETUP                             ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  // 1. Check profiles
  console.log('👥 PROFILES')
  console.log('─'.repeat(50))
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, role')
    .limit(10)

  if (profilesError) {
    console.error('❌ Erro:', profilesError.message)
  } else {
    console.log(`✅ ${profiles.length} profile(s) encontrado(s)`)
    profiles.forEach((p, i) => {
      console.log(`   ${i + 1}. Role: ${p.role} | ID: ${p.id.substring(0, 8)}...`)
    })
  }
  console.log('')

  // 2. Check products
  console.log('📦 PRODUTOS')
  console.log('─'.repeat(50))
  const { data: products, error: productsError } = await supabase
    .from('catalog_products')
    .select('id, name, price, is_active')

  if (productsError) {
    console.error('❌ Erro:', productsError.message)
  } else {
    console.log(`✅ ${products.length} produto(s) no catálogo`)
    if (products.length > 0) {
      const active = products.filter(p => p.is_active).length
      console.log(`   ${active} ativos | ${products.length - active} inativos`)
      console.log('\n   Listando produtos:')
      products.forEach((p, i) => {
        const status = p.is_active ? '🟢' : '⚪'
        console.log(`   ${i + 1}. ${status} ${p.name} (R$ ${p.price})`)
      })
    }
  }
  console.log('')

  // 3. Check sync runs
  console.log('🔄 SINCRONIZAÇÕES')
  console.log('─'.repeat(50))
  const { data: syncRuns, error: syncError } = await supabase
    .from('catalog_sync_runs')
    .select('status, imported, updated, errors')
    .order('started_at', { ascending: false })
    .limit(3)

  if (syncError) {
    console.error('❌ Erro:', syncError.message)
  } else {
    if (syncRuns.length === 0) {
      console.log('⚠️  Nenhuma sincronização executada')
      console.log('   → Acesse /admin/catalogo e clique "Sincronizar agora"')
    } else {
      console.log(`✅ ${syncRuns.length} sincronização(ões):`)
      syncRuns.forEach((run, i) => {
        console.log(`   ${i + 1}. Importados: ${run.imported} | Atualizados: ${run.updated} | Erros: ${run.errors}`)
      })
    }
  }

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  PRÓXIMOS PASSOS                                  ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
  console.log('1. npm run dev')
  console.log('2. http://localhost:8081/login (faça login)')
  console.log('3. http://localhost:8081/catalogo (veja produtos)')
  console.log('4. http://localhost:8081/admin/catalogo (painel admin)\n')
}

verify().catch(console.error)
