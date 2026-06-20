---
description: Encerra a sessão — commita pendências, push pro main e imprime resumo do que foi feito e o que ainda falta fazer manualmente.
---

Execute o fluxo de encerramento de sessão:

## PASSO 1 — Verificar pendências

Execute em paralelo:
- `git status --short` — arquivos não commitados
- `git diff HEAD` — diff completo das mudanças staged/unstaged
- `git log --oneline -10` — histórico recente para referência no resumo

## PASSO 2 — Commitar se houver mudanças

Se `git status --short` retornar qualquer linha:

1. Identifique o prefixo semântico correto (`feat` / `fix` / `chore` / `refactor`) com base no diff.
2. Stage os arquivos relevantes com `git add` — prefira arquivos específicos, nunca `git add -A` cegamente.
3. Faça o commit seguindo o padrão do projeto:
   - Inglês
   - Prefixo semântico
   - Linha de `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` no rodapé
4. `git push origin main`

Se não houver nada para commitar, pule para o PASSO 3.

## PASSO 3 — Imprimir resumo da sessão

Produza um resumo conciso em **português** com estas seções — sem introdução, sem elogio, direto ao ponto:

### O que foi feito
Bullets do que mudou nesta sessão (baseado no `git log` e no diff). Um bullet por entrega, máximo 2 linhas cada.

### Status do deploy
- Se houve push: "Deploy acionado automaticamente na Vercel via push para main."
- Se não houve push: "Nenhum push feito — deploy não acionado."

### O que ainda precisa ser feito manualmente
Bullets com ações que exigem o usuário (painel externo, credencial, teste no browser, etc.). Se não houver nada, escreva "Nenhuma ação manual pendente."

---

**Restrição**: não exponha valores de secrets, tokens ou chaves em nenhuma parte da saída.
