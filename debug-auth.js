import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY0NDcwMCwiZXhwIjoyMDg3MjIwNzAwfQ.7EjJJ0kLLpZpvb5y2vEqnr9xpVfp6EqvwDR4qgKKJQQ'

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const supabaseService = createClient(supabaseUrl, supabaseServiceKey)

async function debug() {
  console.log('\n=== DEBUG: Supabase Auth & Database ===\n')

  // 1. Verificar usuários
  console.log('📋 Verificando usuários no Supabase Auth...\n')
  try {
    const { data: { users }, error } = await supabaseService.auth.admin.listUsers()
    if (error) {
      console.error('❌ Erro ao listar usuários:', error.message)
      return
    }

    if (users.length === 0) {
      console.log('⚠️  PROBLEMA 1: Nenhum usuário encontrado!')
      console.log('   → Você precisa criar um usuário em: https://app.supabase.com/project/kjfsmwtwbreapipifjtu/auth/users')
      console.log('   → Ou fazer signup na página de login')
      return
    }

    console.log(`✅ Encontrado ${users.length} usuário(s):\n`)
    users.forEach((user, i) => {
      console.log(`${i + 1}. Email: ${user.email}`)
      console.log(`   ID: ${user.id}`)
      console.log(`   Confirmado: ${user.email_confirmed_at ? '✅' : '❌'}`)
      console.log('')
    })
  } catch (err) {
    console.error('❌ Erro:', err.message)
    return
  }

  // 2. Verificar profiles
  console.log('📋 Verificando profiles (com Service Role Key)...\n')
  try {
    const { data: profiles, error } = await supabaseService
      .from('profiles')
      .select('*')

    if (error) {
      console.error('❌ Erro ao listar profiles:', error.message)
      console.log('\n⚠️  PROBLEMA: Tabela profiles pode não existir!')
      console.log('   → Você executou a migration SQL?')
      console.log('   → Verifique: supabase/migrations/20250221000001_catalog_schema.sql')
      return
    }

    console.log(`✅ Encontrado ${profiles.length} profile(s):\n`)
    profiles.forEach((p, i) => {
      console.log(`${i + 1}. ID: ${p.id}`)
      console.log(`   Role: ${p.role}`)
      console.log('')
    })

    if (profiles.length === 0) {
      console.log('⚠️  PROBLEMA 2: Nenhum profile encontrado!')
      console.log('   → O trigger automático pode não ter funcionado')
      console.log('   → Solução: Crie profiles manualmente com:')
      console.log('      INSERT INTO public.profiles (id, role) VALUES (..., "user");')
      console.log('')
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 3. Verificar produtos
  console.log('📋 Verificando produtos no catálogo...\n')
  try {
    const { data: products, error } = await supabaseService
      .from('catalog_products')
      .select('*')

    if (error) {
      console.error('❌ Erro ao listar produtos:', error.message)
      return
    }

    console.log(`✅ Encontrado ${products.length} produto(s)\n`)
    if (products.length === 0) {
      console.log('⚠️  PROBLEMA 3: Nenhum produto no catálogo!')
      console.log('   → Você precisa rodar a sincronização com Nuvemshop')
      console.log('   → Ou inserir produtos manualmente')
      console.log('   → Dica: Acesse /admin/catalogo e clique "Sincronizar agora"')
      console.log('')
    }
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  // 4. Testar RLS policies
  console.log('📋 Testando RLS policies...\n')
  try {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('❌ Erro ao acessar produtos (RLS bloqueando?):', error.message)
      console.log('\n   Possível solução:')
      console.log('   → Verifique as RLS policies em: SQL Editor')
      console.log('   → Ou reexecute a migration SQL')
      return
    }

    console.log(`✅ RLS funcionando - acessou ${data.length} produtos públicos\n`)
  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  console.log('=== FIM DO DEBUG ===\n')
}

debug().catch(console.error)
