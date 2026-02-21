#!/bin/bash

# Deploy da Edge Function para Supabase
cd /c/Users/becar/rdc-revend

echo "📝 Fazendo login no Supabase..."
npx supabase login

echo "🚀 Deployando edge function..."
npx supabase functions deploy sync-nuvemshop

echo "✅ Deploy completo!"
