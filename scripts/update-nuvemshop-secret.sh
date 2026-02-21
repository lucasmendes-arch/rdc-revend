#!/bin/bash

# Script para obter token Nuvemshop e atualizar no Supabase em um comando

set -e

echo "🚀 Nuvemshop Token - Obter e Atualizar no Supabase"
echo "=================================================="
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado"
    exit 1
fi

# Verificar se Supabase CLI está instalado
if ! command -v npx supabase &> /dev/null; then
    echo "⚠️  Supabase CLI pode não estar disponível"
    echo "   Instale com: npm install -g supabase"
fi

# Se argumentos não foram passados, pedir interativamente
if [ $# -lt 3 ]; then
    echo "Enter Nuvemshop configuration:"
    echo ""
    read -p "  Client ID: " CLIENT_ID
    read -p "  Client Secret: " CLIENT_SECRET
    read -p "  Authorization Code (from URL): " CODE
    echo ""
else
    CLIENT_ID=$1
    CLIENT_SECRET=$2
    CODE=$3
fi

# Obter token
TOKEN_OUTPUT=$(node scripts/get-nuvemshop-token.js "$CLIENT_ID" "$CLIENT_SECRET" "$CODE" 2>&1)

# Extrair o token (a linha entre os === é o token)
TOKEN=$(echo "$TOKEN_OUTPUT" | sed -n '/^━━━/,/^━━━/{/^━━━/!p}' | grep -v "^$" | head -1 | xargs)

if [ -z "$TOKEN" ]; then
    echo "❌ Não foi possível extrair o token"
    echo "$TOKEN_OUTPUT"
    exit 1
fi

echo ""
echo "🔄 Atualizando secret no Supabase..."
echo ""

# Atualizar no Supabase
npx supabase secrets set NUVEMSHOP_ACCESS_TOKEN="$TOKEN"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Secret atualizado com sucesso!"
    echo ""
    echo "🚀 Deploy da edge function:"
    echo "   npx supabase functions deploy sync-nuvemshop"
    echo ""
else
    echo "❌ Erro ao atualizar secret"
    exit 1
fi
