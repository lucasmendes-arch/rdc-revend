#!/bin/bash

# Script para fazer deploy da edge function sync-nuvemshop
# Uso: bash deploy.sh <seu-access-token-supabase>

set -e

PROJECT_REF="kjfsmwtwbreapipifjtu"
FUNCTION_NAME="sync-nuvemshop"

echo "🚀 Supabase Edge Function Deploy - sync-nuvemshop"
echo "=================================================="
echo ""

# Verificar se token foi fornecido
if [ -z "$1" ]; then
    echo "❌ Erro: Access token do Supabase não fornecido"
    echo ""
    echo "Como obter o token:"
    echo "1. Acesse: https://app.supabase.com/account/tokens"
    echo "2. Crie um novo 'Personal' token"
    echo "3. Copie o token"
    echo ""
    echo "Uso:"
    echo "  bash deploy.sh <seu-access-token>"
    echo ""
    echo "Exemplo:"
    echo "  bash deploy.sh sbp_xxxxxxxxxxxxxxxxxxxxx"
    exit 1
fi

# Exportar token para o Supabase CLI
export SUPABASE_ACCESS_TOKEN="$1"

echo "✅ Token configurado"
echo ""

# Linkar ao projeto
echo "🔗 Linkando ao projeto Supabase..."
npx supabase link --project-ref "$PROJECT_REF"

echo ""
echo "📤 Fazendo deploy da edge function '$FUNCTION_NAME'..."
npx supabase functions deploy "$FUNCTION_NAME"

echo ""
echo "✅ Deploy concluído com sucesso!"
echo ""
echo "Próximos passos:"
echo "1. Acesse: https://app.supabase.com/project/$PROJECT_REF/functions"
echo "2. Verifique que a função '$FUNCTION_NAME' está ativa"
echo "3. Configure os Secrets se ainda não fez:"
echo "   - NUVEMSHOP_STORE_ID"
echo "   - NUVEMSHOP_USER_AGENT"
echo "   - NUVEMSHOP_ACCESS_TOKEN"
echo ""
echo "💡 Tip: Você pode remover o token desta máquina com:"
echo "  unset SUPABASE_ACCESS_TOKEN"
