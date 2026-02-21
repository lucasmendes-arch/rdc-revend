import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function createTestUser() {
  try {
    console.log('🔄 Tentando criar usuário de teste...\n')

    const { data, error } = await supabase.auth.signUp({
      email: 'revenda.teste@gmail.com',
      password: 'Senha@12345',
      options: {
        data: {
          name: 'Usuário Teste',
        }
      }
    })

    if (error) {
      console.error('❌ Erro ao criar usuário:', error.message)
      return
    }

    console.log('✅ Usuário criado com sucesso!\n')
    console.log('📧 Email:', data.user?.email)
    console.log('🔑 Senha: senha123456')
    console.log('\n💡 Dica: Se o usuário já existia, pode fazer login normalmente com essas credenciais.')
  } catch (err) {
    console.error('❌ Erro inesperado:', err)
  }
}

createTestUser()
