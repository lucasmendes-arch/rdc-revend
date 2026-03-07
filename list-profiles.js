import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAdmin() {
    const { data, error } = await supabase.from('profiles').select('*')
    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Profiles:', data)
    }
}

checkAdmin()
