# 🔍 Troubleshooting - Catálogo não carrega após login

## Status Confirmado
✅ Supabase funcionando
✅ Banco de dados com 5 produtos
✅ Usuário admin criado (lmendescapelini@gmail.com)
❌ Frontend carregando indefinidamente

## Possíveis Causas
1. Dev server travado ou com erro
2. Cache do navegador obsoleto
3. Error na query que não está sendo mostrado

## Solução - Passo a Passo

### 1. Reiniciar Dev Server (IMPORTANTE)
```bash
npm run dev
```
Aguarde até ver:
```
  VITE v4.x.x  ready in xxx ms

  ➜  Local:   http://localhost:8081/
```

### 2. Limpar Cache do Navegador
- Abra o navegador
- Pressione **F12** (DevTools)
- Vá a **Application** → **Cache Storage**
- Delete todos os caches
- Ou use: **Ctrl+Shift+Delete** → Clear All

### 3. Testar com URL Limpa
```
http://localhost:8081/?t=123456789
```
(o `?t=...` força o navegador a não usar cache)

### 4. Verificar Console de Erros
- Pressione **F12**
- Vá a **Console**
- Procure por erros vermelhos
- Se houver erro, compartilhe comigo

### 5. Testar cada URL Isoladamente
```
http://localhost:8081/              (home)
http://localhost:8081/login         (login page)
http://localhost:8081/catalogo      (após login)
http://localhost:8081/admin/catalogo (painel admin)
```

### 6. Se Ainda Não Funcionar
Execute no terminal:
```bash
# Ver logs do dev server
npm run dev

# Em outro terminal, fazer request manual
curl -X GET http://localhost:8081/
```

## Checklist Rápido
- [ ] Dev server reiniciado?
- [ ] Viu "ready in xxx ms"?
- [ ] Cache do navegador limpo?
- [ ] Tentou F5 para refresh?
- [ ] Viu erro no console (F12)?
- [ ] Testou cada URL separadamente?

## Próximo Passo
Após executar os passos acima, me avisa:
1. Se conseguiu acessar /catalogo
2. Se viu erro no console
3. Se conseguiu acessar /admin/catalogo
