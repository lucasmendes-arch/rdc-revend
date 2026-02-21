# 🔧 Guia de Correção - RLS Recursion Bug

## ❌ Problema Identificado

Sua migration SQL tem um erro de **recursão infinita nas RLS policies**:
```
infinite recursion detected in policy for relation "profiles"
```

Isso impede que:
- ✅ Você acesse o catálogo
- ✅ Você faça login

## ✅ Solução - 3 Passos

### **Passo 1: Executar SQL de Correção**

1. Abra https://app.supabase.com/project/kjfsmwtwbreapipifjtu
2. Vá a **SQL Editor** → **New Query**
3. Copie todo o conteúdo de `fix-rls.sql`
4. Execute (Ctrl+Enter ou botão ▶️)

Você deve ver: ✅ "Migration de RLS completada!"

### **Passo 2: Criar um Usuário de Teste**

1. Vá a **Auth** → **Users**
2. Clique **Create new user**
3. Preencha:
   - **Email:** seu@email.com (qualquer um)
   - **Password:** sua-senha-aqui
   - **Auto Confirm:** ✅ Marque (IMPORTANTE!)
4. Clique **Create user**

### **Passo 3: Testar Localmente**

```bash
npm run dev
```

Agora:
1. Acesse http://localhost:8083/login
2. Faça login com o email/senha que criou
3. Você deve ser redirecionado para `/catalogo`
4. Acesse `/admin/catalogo`
5. Clique "Sincronizar agora"
6. Produtos aparecem!

---

## 🧪 Verificação

Se ainda tiver problemas:

1. **Login falha:**
   - Verifique se o email está correto
   - Verifique se "Auto Confirm" foi marcado ao criar usuário
   - Tente criar outro usuário

2. **Catálogo ainda fica rodando:**
   - Abra F12 → Console (no navegador)
   - Procure por erros vermelhos
   - Copie o erro e compartilhe

3. **Admin não funciona:**
   - Verifique se você é admin:
     ```sql
     SELECT email, role FROM public.profiles;
     ```
   - Se role for 'user', torne admin:
     ```sql
     UPDATE public.profiles SET role = 'admin'
     WHERE id = (SELECT id FROM auth.users WHERE email = 'seu@email.com');
     ```

---

## 📝 O que foi corrigido

**Antes (com recursão):**
```sql
-- Isso causa loop porque profiles policy checa profiles novamente
create policy "admin_read_all_products" on public.catalog_products
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
```

**Depois (sem recursão):**
```sql
-- Simples: usa subquery direto sem recursão
create policy "admin_full_access" on public.catalog_products
  for all using (
    auth.uid() in (select id from public.profiles where role = 'admin')
  );
```

---

## 🎯 Próximos Passos

Depois que os 3 passos acima funcionarem:

1. ✅ Login funciona
2. ✅ Catálogo carrega
3. ✅ Admin pode sincronizar

**Seu app está 100% funcional!** 🚀

Me avisa se tiver mais problemas após aplicar essa correção.
