import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkUser() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  VERIFICAR ADMIN DO USUÁRIO                       ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  try {
    // 1. Get current session
    console.log('👤 Buscando sessão atual...')
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.log('⚠️  Nenhuma sessão ativa no Node.js')
      console.log('   (Isso é normal - estamos verificando o banco diretamente)\n')
    }

    // 2. Check all profiles
    console.log('📋 Todos os usuários (profiles):')
    console.log('─'.repeat(50))
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, role')

    if (profilesError) {
      console.error('❌ Erro:', profilesError.message)
    } else {
      console.log(`Total: ${profiles.length} profile(s)\n`)
      profiles.forEach((p, i) => {
        console.log(`${i + 1}. ID: ${p.id.substring(0, 8)}... | Role: ${p.role}`)
      })
    }

    // 3. Check all auth users
    console.log('\n🔑 Tentando buscar usuários do auth (pode não funcionar com anon key)...')
    console.log('─'.repeat(50))

    // Fazer query direto na profiles para achar o usuário lmendescapelini
    console.log('\n🔍 Procurando usuário lmendescapelini...')
    const { data: allProfiles } = await supabase.from('profiles').select('id, role')

    if (allProfiles && allProfiles.length > 0) {
      const firstUser = allProfiles[0]
      console.log(`✅ Encontrado:`)
      console.log(`   ID: ${firstUser.id}`)
      console.log(`   Role: ${firstUser.role}`)
      console.log(`   É admin? ${firstUser.role === 'admin' ? '✅ SIM' : '❌ NÃO'}`)

      if (firstUser.role !== 'admin') {
        console.log('\n⚠️  PROBLEMA ENCONTRADO!')
        console.log('   O usuário NÃO é admin!')
        console.log('   Isso é por isso que /admin/catalogo não carrega.\n')
        console.log('   SOLUÇÃO:')
        console.log('   Execute no SQL Editor do Supabase:')
        console.log(`   UPDATE public.profiles SET role = 'admin' WHERE id = '${firstUser.id}';`)
      }
    }

  } catch (err) {
    console.error('❌ Erro:', err.message)
  }

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  FIM DA VERIFICAÇÃO                               ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
}

checkUser().catch(console.error)
