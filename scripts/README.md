# Scripts Nuvemshop

Scripts para gerenciar tokens de autenticação da Nuvemshop/Tienda Nube.

## 📚 Fluxo de Autenticação

1. **Instalar app na loja** → Nuvemshop redireciona com `code` na URL
2. **Obter access token** → POST com `client_id`, `client_secret`, `code`
3. **Salvar no Supabase** → `npx supabase secrets set NUVEMSHOP_ACCESS_TOKEN=...`
4. **Deploy** → `npx supabase functions deploy sync-nuvemshop`

---

## 🚀 Opção 1: Setup Interativo (Recomendado)

Ideal para primeira configuração ou renovação de tokens.

```bash
node scripts/setup-nuvemshop.js
```

**O que faz:**
- ✅ Pede as informações interativamente
- ✅ Obtém o token da Nuvemshop
- ✅ Atualiza no Supabase secrets
- ✅ Deploy da edge function (opcional)

**Requisitos:**
- Ter o `Client ID` do app Nuvemshop
- Ter o `Client Secret` do app
- Ter o `Authorization Code` (da URL após instalar app)

---

## 🔧 Opção 2: Script Simples (CLI)

Para uso direto com argumentos.

```bash
node scripts/get-nuvemshop-token.js <client_id> <client_secret> <code>
```

**Exemplo:**
```bash
node scripts/get-nuvemshop-token.js 25931 "70e73f4697..." "663ee3..."
```

**Saída:**
```
✅ Token obtido com sucesso!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Access Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🐚 Opção 3: Script Bash (macOS/Linux)

Para automatizar via shell script.

```bash
chmod +x scripts/update-nuvemshop-secret.sh
./scripts/update-nuvemshop-secret.sh
```

Ou com argumentos:
```bash
./scripts/update-nuvemshop-secret.sh 25931 "70e73f..." "663ee3..."
```

---

## 📋 Como Obter as Informações

### Client ID e Client Secret
1. Vá para https://www.tiendanube.com/developers/apps
2. Clique no seu app
3. Na aba "API credentials" ou "Credenciales", copie:
   - `Client ID`
   - `Client Secret`

### Authorization Code
1. Vá para https://www.tiendanube.com/apps/
2. Clique em "Instalar" no seu app
3. Selecione a loja e confirme
4. Será redirecionado para uma URL como:
   ```
   https://seu-dominio.com/callback?code=663ee3753ec02abf9c1e64c121c7b5ad21cf97f9&...
   ```
5. Copie o valor do parâmetro `code`

---

## 🔐 Atualizar Secret Manualmente

Se preferir não usar os scripts, atualize assim:

```bash
# 1. Copiar o token
npx supabase secrets set NUVEMSHOP_ACCESS_TOKEN="seu_token_aqui"

# 2. Verificar se foi salvo
npx supabase secrets list

# 3. Deploy da edge function
npx supabase functions deploy sync-nuvemshop
```

---

## ⚠️ Segurança

- 🔒 Nunca commite tokens no git
- 🔐 Use `npx supabase secrets set` para armazenar
- 🗑️ Se expuser um token, rotacione imediatamente na Nuvemshop
- 📝 Mantenha `Client Secret` em lugar seguro

---

## 🐛 Troubleshooting

### "Unauthorized" ou "401"
- ❌ Token expirou ou é inválido
- ✅ Gere um novo seguindo as etapas acima

### "Forbidden" ou "403"
- ❌ Token é válido mas usuário não é admin
- ✅ Verifique que a loja está vinculada ao app

### "Invalid code"
- ❌ Authorization code expirou (geralmente 1 hora)
- ✅ Reinstale o app na loja e obtenha novo code

### Script não executa no Windows
- ✅ Use `node scripts/setup-nuvemshop.js` (recomendado)
- ✅ Ou use Git Bash/WSL para `.sh`

---

## 📞 Suporte

- [Nuvemshop API Docs](https://tiendanube.github.io/api-documentation/)
- [OAuth Flow](https://tiendanube.github.io/api-documentation/v1/auth)
