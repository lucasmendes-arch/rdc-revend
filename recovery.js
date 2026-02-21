import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kjfsmwtwbreapipifjtu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZnNtd3R3YnJlYXBpcGlmanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDQ3MDAsImV4cCI6MjA4NzIyMDcwMH0.MH1zmS2TnHLr9PxL5yjhAgWdJvauzamC6vGvMLRp6ms'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function recover() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║  SCRIPT DE RECUPERAÇÃO                            ║')
  console.log('╚════════════════════════════════════════════════════╝\n')

  console.log('⚠️  Este script vai:')
  console.log('   1. Listar todos os usuários')
  console.log('   2. Tornar o primeiro usuário admin')
  console.log('   3. Listar produtos no catálogo')
  console.log('   4. Criar produtos de teste se estiver vazio\n')

  try {
    // 1. List all profiles
    console.log('👥 1. LISTANDO USUÁRIOS')
    console.log('─'.repeat(50))
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, role')

    if (profilesError) {
      console.error('❌ Erro ao buscar profiles:', profilesError.message)
      return
    }

    if (profiles.length === 0) {
      console.log('❌ Nenhum usuário cadastrado!')
      console.log('   → Crie um usuário em: Auth → Users → Create new user\n')
      return
    }

    console.log(`✅ ${profiles.length} usuário(s) encontrado(s):`)
    profiles.forEach((p, i) => {
      console.log(`   ${i + 1}. ID: ${p.id.substring(0, 8)}... | Role: ${p.role}`)
    })
    console.log('')

    // 2. Make first user admin
    const firstUserId = profiles[0].id
    const firstUserRole = profiles[0].role

    if (firstUserRole !== 'admin') {
      console.log('👑 2. TORNANDO PRIMEIRO USUÁRIO ADMIN')
      console.log('─'.repeat(50))
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', firstUserId)

      if (updateError) {
        console.error('❌ Erro ao atualizar role:', updateError.message)
      } else {
        console.log(`✅ Usuário ${firstUserId.substring(0, 8)}... é ADMIN agora!\n`)
      }
    } else {
      console.log('✅ Primeiro usuário já é admin!\n')
    }

    // 3. Check products
    console.log('📦 3. VERIFICANDO CATÁLOGO')
    console.log('─'.repeat(50))
    const { data: products, error: productsError } = await supabase
      .from('catalog_products')
      .select('*')

    if (productsError) {
      console.error('❌ Erro ao buscar produtos:', productsError.message)
      console.log('   → Isso pode significar que a tabela não existe')
      return
    }

    console.log(`✅ Total: ${products.length} produtos\n`)

    if (products.length === 0) {
      console.log('⚠️  CATÁLOGO VAZIO!')
      console.log('─'.repeat(50))
      console.log('Criando 5 produtos de teste...\n')

      const testProducts = [
        {
          name: 'Revenda De Cachos - Shampoo',
          nuvemshop_product_id: 1001,
          price: 49.90,
          compare_at_price: 79.90,
          description_html: '<p>Shampoo para cabelos cacheados. Limpa suavemente sem ressecar.</p>',
          main_image: 'https://via.placeholder.com/300?text=Shampoo',
          is_active: true,
          source: 'manual'
        },
        {
          name: 'Revenda De Cachos - Condicionador',
          nuvemshop_product_id: 1002,
          price: 49.90,
          compare_at_price: 79.90,
          description_html: '<p>Condicionador intenso para hidratação profunda.</p>',
          main_image: 'https://via.placeholder.com/300?text=Condicionador',
          is_active: true,
          source: 'manual'
        },
        {
          name: 'Revenda De Cachos - Leave-in',
          nuvemshop_product_id: 1003,
          price: 39.90,
          compare_at_price: 69.90,
          description_html: '<p>Leave-in para definição e controle de frizz.</p>',
          main_image: 'https://via.placeholder.com/300?text=Leave-in',
          is_active: true,
          source: 'manual'
        },
        {
          name: 'Revenda De Cachos - Gel',
          nuvemshop_product_id: 1004,
          price: 29.90,
          compare_at_price: 59.90,
          description_html: '<p>Gel fixador com brilho natural.</p>',
          main_image: 'https://via.placeholder.com/300?text=Gel',
          is_active: true,
          source: 'manual'
        },
        {
          name: 'Revenda De Cachos - Kit Completo',
          nuvemshop_product_id: 1005,
          price: 149.90,
          compare_at_price: 279.90,
          description_html: '<p>Kit com todos os produtos para cabelos cacheados.</p>',
          main_image: 'https://via.placeholder.com/300?text=Kit',
          is_active: true,
          source: 'manual'
        }
      ]

      const { data: inserted, error: insertError } = await supabase
        .from('catalog_products')
        .insert(testProducts)

      if (insertError) {
        console.error('❌ Erro ao inserir produtos:', insertError.message)
      } else {
        console.log(`✅ ${inserted.length} produtos de teste criados!\n`)
      }
    } else {
      console.log('Produtos encontrados:')
      products.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. ${p.name}`)
      })
      if (products.length > 5) {
        console.log(`... e mais ${products.length - 5}`)
      }
      console.log('')
    }

    console.log('╔════════════════════════════════════════════════════╗')
    console.log('║  RECUPERAÇÃO COMPLETA                             ║')
    console.log('╚════════════════════════════════════════════════════╝')
    console.log('\n✅ Próximos passos:')
    console.log('   1. npm run dev')
    console.log('   2. http://localhost:8081/login')
    console.log('   3. Faça login (será a primeira conta do Supabase)')
    console.log('   4. http://localhost:8081/admin/catalogo (como admin)')
    console.log('   5. Clique "Sincronizar agora" para buscar do Nuvemshop\n')

  } catch (err) {
    console.error('❌ Erro geral:', err.message)
  }
}

recover().catch(console.error)
