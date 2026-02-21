import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const email = `revenda${Date.now()}@gmail.com`
  const pwd = 'Senha123456'
  
  console.log('\n🔄 Criando usuário de teste...\n')
  console.log('📧 Email:', email)
  console.log('🔑 Senha:', pwd)
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password: pwd
  })

  if (error) {
    console.log('\n❌ Erro:', error.message)
  } else {
    console.log('\n✅ Usuário criado com sucesso!')
    console.log('\n💡 Use essas credenciais no login para testar o fluxo completo.')
  }
}

test()
