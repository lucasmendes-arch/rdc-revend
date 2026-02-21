# 🚀 Guia de Deploy - Catalog + Nuvemshop Sync

## ✅ Checklist Pre-Deploy

- [ ] Conta Supabase criada
- [ ] Projeto Supabase ativo
- [ ] Access token do Supabase gerado (para CLI)
- [ ] Nuvemshop API token disponível
- [ ] Migration SQL pronta para aplicar
- [ ] Edge function pronta para deploy

---

## 📋 Passo 1: Aplicar Migration SQL

### Opção A: Dashboard Supabase (Mais fácil)

1. Abra https://app.supabase.com/project/kjfsmwtwbreapipifjtu
2. Vá a **SQL Editor** → **New Query**
3. Copie o conteúdo de:
   ```
   supabase/migrations/20250221000001_catalog_schema.sql
   ```
4. Execute (botão ▶️ ou Ctrl+Enter)
5. Deve ver: "Success" para cada statement

✅ **Pronto:** Tabelas `profiles`, `catalog_products`, `catalog_sync_runs` criadas com RLS

---

## 🔑 Passo 2: Configurar Supabase Secrets

1. Dashboard Supabase
2. **Settings** → **Edge Functions** (na sidebar, ou Settings → Functions)
3. Clique em **Manage Secrets**
4. Adicione 3 secrets:

```
NUVEMSHOP_STORE_ID = 1880595765
```

```
NUVEMSHOP_USER_AGENT = rdc_fiqon (duno.reidoscachos@gmail.com)
```

```
NUVEMSHOP_ACCESS_TOKEN = seu-token-aqui-sem-bearer
```

✅ **Pronto:** Secrets configurados (usados automaticamente pela edge function)

---

## 📤 Passo 3: Deploy da Edge Function

### Opção A: Supabase CLI (Recomendado)

1. **Autenticar:**
   ```bash
   npx supabase login
   ```
   Será aberto browser para gerar um access token. Copie e cole no terminal.

2. **Linkar ao projeto:**
   ```bash
   npx supabase link --project-ref kjfsmwtwbreapipifjtu
   ```
   Confirme com "y"

3. **Deploy:**
   ```bash
   npx supabase functions deploy sync-nuvemshop
   ```

✅ Output esperado:
```
Deploying function 'sync-nuvemshop'...
✓ Function deployed successfully!
```

---

### Opção B: Deploy Manual via Dashboard

Se o CLI não funcionar:

1. Dashboard Supabase → **Edge Functions**
2. **Create new function** → `sync-nuvemshop`
3. Copie o conteúdo de:
   ```
   supabase/functions/sync-nuvemshop/index.ts
   ```
4. Cole no editor
5. Clique **Deploy**

Secrets usadas automaticamente (já foram configuradas no Passo 2).

---

## 👤 Passo 4: Tornar Usuário Admin

1. Dashboard Supabase → **SQL Editor** → **New Query**
2. Execute:
   ```sql
   UPDATE public.profiles SET role = 'admin'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'duno.reidoscachos@gmail.com');
   ```

✅ Seu usuário agora é admin e pode acessar `/admin/catalogo`

---

## 🧪 Passo 5: Testar Localmente

1. Banco de dados aplicado: ✅
2. Secrets configurados: ✅
3. Edge function deployed: ✅
4. Usuário é admin: ✅

Agora teste o app:

```bash
npm run dev
```

Acesse:
- **Landing:** http://localhost:8083
- **Login:** http://localhost:8083/login (faça login)
- **Catálogo:** http://localhost:8083/catalogo (produtos ativos apenas)
- **Admin:** http://localhost:8083/admin/catalogo (painel admin - só funciona se for admin)

### Teste do Admin:
1. Clique "Sincronizar agora"
2. Aguarde alguns segundos
3. Deve aparecer toast com "✅ Importados: X"
4. Produtos aparecem na listagem
5. Toggle "Ativo/Pausado"
6. Editar produto
7. Deletar produto (com confirmação)

---

## 🔍 Debug

### Edge Function não encontrada (404)
- Verifique: `npx supabase functions list`
- Deploy novamente: `npx supabase functions deploy sync-nuvemshop`

### Erro "Unauthorized" ao sincronizar
- Verifique se você é admin:
  ```sql
  SELECT id, role FROM public.profiles WHERE role = 'admin';
  ```
- Se não aparecer, execute SQL do Passo 4 novamente

### Erro "Missing Nuvemshop configuration"
- Verifique Supabase Secrets estão configurados:
  Dashboard → Settings → Edge Functions → Manage Secrets
- Redeploy: `npx supabase functions deploy sync-nuvemshop`

### Access Token da CLI não funciona
1. Tente com Dashboard (Opção B)
2. Ou gere novo token:
   - https://app.supabase.com/account/tokens
   - Crie novo token pessoal
   - Cole no `supabase login`

---

## 📚 Referências

- Docs Supabase CLI: https://supabase.com/docs/guides/cli
- Edge Functions: https://supabase.com/docs/guides/functions
- RLS: https://supabase.com/docs/guides/auth/row-level-security

---

## ✨ Tudo pronto!

Próximos passos opcionais:
- [ ] Configurar domínio customizado
- [ ] Setup CI/CD para auto-deploy
- [ ] Adicionar mais funcionalidades ao admin
- [ ] Integrar com sistema de pagamento

Qualquer dúvida, me avisa! 🚀
