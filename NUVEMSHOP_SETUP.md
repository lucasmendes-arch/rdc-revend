# 🚀 Guia Rápido: Configurar Token Nuvemshop

## Fluxo Completo em 5 Minutos

```
┌─────────────────────────────────────────┐
│  1. Obter Credenciais no Nuvemshop      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  2. Instalar App na Loja                │
│     → Copiar Authorization Code         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  3. Executar Script de Setup            │
│     npm run nuvemshop:setup             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  4. Token Salvo no Supabase ✅          │
│     Edge Function Deployada ✅          │
└─────────────────────────────────────────┘
```

---

## Passo 1️⃣ : Obter Credenciais

### No Painel do Nuvemshop

1. Acesse: **https://www.tiendanube.com/developers/apps**
2. Clique no seu app
3. Vá até **"API Credentials"** ou **"Credenciales"**
4. Copie:
   - `Client ID` → Ex: `25931`
   - `Client Secret` → Ex: `70e73f4697d6bc34f503b55cd6103468fa35f891...`

```
┌────────────────────────────────┐
│ Client ID                      │
│ ┌──────────────────────────┐   │
│ │ 25931                    │   │
│ └──────────────────────────┘   │
│                                │
│ Client Secret                  │
│ ┌──────────────────────────┐   │
│ │ 70e73f4697d6bc34...      │   │
│ └──────────────────────────┘   │
└────────────────────────────────┘
```

---

## Passo 2️⃣ : Instalar App na Loja

1. Acesse: **https://www.tiendanube.com/apps/**
2. Procure o seu app
3. Clique em **"Instalar"** (ou "Install")
4. Selecione a loja desejada
5. Confirme as permissões
6. Será redirecionado para uma URL como:

```
https://seu-dominio.com/callback?code=663ee3753ec02abf9c1e64c121c7b5ad21cf97f9&state=...
                                       ↑
                                Copie este código
```

**⏱️ Atenção:** O código expira em ~1 hora! Vá direto para o Passo 3.

---

## Passo 3️⃣ : Executar Script de Setup

### Opção A: Setup Interativo (Recomendado) ⭐

```bash
npm run nuvemshop:setup
```

O script irá:
- ✅ Pedir `Client ID`
- ✅ Pedir `Client Secret`
- ✅ Pedir `Authorization Code`
- ✅ Validar com Nuvemshop
- ✅ Salvar no Supabase
- ✅ Fazer Deploy da edge function

### Opção B: Linha de Comando

```bash
npm run nuvemshop:token -- 25931 "70e73f..." "663ee3..."
```

### Opção C: Só Obter Token

Se quiser só gerar o token (sem atualizar Supabase):

```bash
npm run nuvemshop:token -- 25931 "70e73f..." "663ee3..."
```

---

## ✅ Verificar se Funcionou

Após o setup, o token deve estar visível no Supabase:

```bash
npx supabase secrets list
```

Você verá algo como:
```
NAME                          VALUE
NUVEMSHOP_ACCESS_TOKEN        eyJhbGciOiJIUzI1NiI...
```

Teste a sincronização:
1. Faça login como admin
2. Vá para `/admin/catalogo`
3. Clique em "Sincronizar"
4. Verifique se os produtos aparecem

---

## 🔄 Renovar Token (Quando Expirar)

Tokens Nuvemshop têm expiração. Para renovar:

```bash
npm run nuvemshop:setup
```

Repita o processo com um novo `Authorization Code` (reinstale o app).

---

## 🆘 Erros Comuns

### ❌ "Invalid code"
- **Causa:** Código expirou (1 hora de validade)
- **Solução:** Reinstale o app e obtenha novo código rapidamente

### ❌ "Unauthorized" (401)
- **Causa:** `Client ID` ou `Client Secret` errados
- **Solução:** Copie novamente do painel Nuvemshop

### ❌ "Forbidden" (403)
- **Causa:** Token válido, mas app não autorizado na loja
- **Solução:** Reinstale o app com as permissões corretas

### ❌ Script não executa (Windows)
- **Solução:** Use Git Bash ou execute `node` diretamente:
  ```bash
  node scripts/setup-nuvemshop.js
  ```

---

## 📋 Checklist Final

- [ ] Credenciais obtidas (Client ID + Secret)
- [ ] App instalado na loja
- [ ] Authorization Code copiado
- [ ] Script executado: `npm run nuvemshop:setup`
- [ ] Token visível em `npx supabase secrets list`
- [ ] Edge function deployada
- [ ] Teste de sincronização feito ✅

---

## 📚 Documentação Completa

Veja [scripts/README.md](./scripts/README.md) para mais detalhes.

---

## 🔗 Links Úteis

- 🔐 [Nuvemshop API Docs](https://tiendanube.github.io/api-documentation/)
- 🔄 [OAuth Authorization Flow](https://tiendanube.github.io/api-documentation/v1/auth)
- 📱 [Tienda Nube Apps](https://www.tiendanube.com/apps/)

---

**Pronto! 🎉 Seu app está conectado à Nuvemshop**
