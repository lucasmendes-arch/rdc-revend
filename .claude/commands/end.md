---
description: Encerra a sessão — commita pendências, revisa o código, mergeia na main e sobe pra produção.
---

Execute o fluxo de encerramento de sessão.

## PASSO 1 — Levantar estado

Execute em paralelo:
- `git branch --show-current`
- `git status --short`
- `git diff HEAD`
- `git log --oneline -10`

## PASSO 2 — Commitar pendências

Se `git status --short` retornar qualquer linha:
1. Identifique o prefixo semântico certo (`feat`/`fix`/`chore`/`refactor`) pelo diff.
2. `git add` só os arquivos relevantes — nunca `git add -A` às cegas (risco de subir `.env`, credenciais ou binário grande sem querer).
3. Commit no padrão do projeto: inglês, prefixo semântico, rodapé `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

Se não houver nada pendente, siga direto pro PASSO 3.

## PASSO 3 — Checagens antes do review

1. `npx tsc --noEmit -p tsconfig.app.json`. Se falhar, verifique se os erros já existiam antes desta sessão (checkout de `main`, rodar o mesmo comando lá, comparar) antes de decidir se bloqueia. **Erros novos introduzidos nesta sessão bloqueiam** — corrigir antes de prosseguir. Erros pré-existentes documentados (ver `docs/security-checkup-2026-07-23.md`) não bloqueiam, mas mencione no resumo final.
2. Se a branch tocou `supabase/functions/create-order/index.ts`, confirme que o checklist de `docs/create-order-contract.md` foi cumprido integralmente antes de seguir.

## PASSO 4 — Review de código

Rode a skill `security-review` sobre as mudanças da sessão (branch atual vs `main`). Reporte achados relevantes ao usuário — não prossiga silenciosamente se houver algo de severidade alta/crítica sem que o usuário tenha visto.

Se o usuário pedir explicitamente um review mais completo (CodeRabbit), ofereça `/code-review` como passo adicional — não assuma que está configurado neste projeto.

## PASSO 5 — Merge pra main

Só prossiga se o PASSO 3 e o PASSO 4 não tiverem bloqueio sem resposta do usuário.

1. Se a branch atual já for `main`, pule pro PASSO 6.
2. `git checkout main && git pull origin main --ff-only`
3. `git merge --no-ff <branch> -m "Merge branch '<branch>'"` com corpo curto descrevendo o que entrou + rodapé `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
4. Se houver conflito, **PARE** e peça orientação ao usuário — nunca resolva um conflito de forma destrutiva (`--ours`/`--theirs` cego) sem mostrar o que está sendo descartado.

## PASSO 6 — Push

`git push origin main`

## PASSO 7 — Limpeza da branch

Se o merge partiu de uma branch de feature (não era `main` desde o início da sessão):

Pergunte ao usuário se pode apagar a branch — local (`git branch -d <branch>`) e remota, se existir (`git push origin --delete <branch>`). **Nunca apague sem confirmação explícita** — pode haver PR aberto ou outra sessão trabalhando nela.

## PASSO 8 — Resumo da sessão

Produza um resumo conciso em **português**, sem introdução nem elogio:

### O que foi feito
Bullets do que mudou nesta sessão (baseado no `git log` e no diff). Um bullet por entrega, no máximo 2 linhas cada.

### Review
O que a skill de segurança encontrou (ou "nada relevante encontrado").

### Status do deploy
- Se houve push pra `main`: "Deploy acionado automaticamente na Vercel via push para main."
- Se não houve push: motivo (bloqueio no PASSO 3/4, ou nada pra commitar).

### O que ainda precisa ser feito manualmente
Bullets com ações que exigem o usuário (painel externo, credencial, teste no browser, ativar cron, etc.). Se não houver nada, escreva "Nenhuma ação manual pendente."

---

**Restrições**: não exponha secrets/tokens/chaves na saída. Nunca use `--no-verify`, `--force`, `git reset --hard` ou resolução de conflito às cegas neste fluxo.
