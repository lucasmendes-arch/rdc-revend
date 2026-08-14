---
description: Abre uma nova sessão de trabalho — sincroniza main, cria a branch e monta o plano da tarefa.
---

Execute o fluxo de abertura de sessão para a tarefa: $ARGUMENTS

Se `$ARGUMENTS` estiver vazio, pergunte ao usuário o que vai ser feito antes de continuar — não crie uma branch sem saber o escopo.

## PASSO 1 — Garantir working tree limpo

`git status --short`

- Se houver qualquer mudança não commitada (staged ou não), **PARE** e pergunte ao usuário o que fazer: commitar na branch atual, descartar, ou deixar como está. Nunca descarte ou faça stash silenciosamente.

## PASSO 2 — Sincronizar main

Em sequência:
1. `git checkout main`
2. `git pull origin main --ff-only`

Se o pull falhar (divergência/non-fast-forward), pare e avise o usuário — não force nem faça merge/rebase por conta própria aqui.

## PASSO 3 — Criar a branch

1. A partir de `$ARGUMENTS`, derive um slug curto em inglês, kebab-case, seguindo o padrão já usado no repo (`feat/trinks-dashboard`, `fix/upload-validation`, `refactor/dropdown-redesign`).
2. Escolha o prefixo semântico certo: `feat` / `fix` / `chore` / `refactor`.
3. `git checkout -b <prefixo>/<slug>`
4. Confirme ao usuário o nome da branch criada.

## PASSO 4 — Montar o plano

1. Chame `EnterPlanMode`.
2. Antes de planejar, leia o necessário: `CLAUDE.md`, `docs/SCHEMA.md`, as seções relevantes de `private-docs/memory.md`, e a memória automática já carregada no contexto.
3. Se a tarefa tocar `supabase/functions/create-order/index.ts` (feature freeze), alerte isso já no plano e deixe explícito que precisa de confirmação humana antes de qualquer edição nesse arquivo — ver `docs/create-order-contract.md`.
4. Escreva o plano: objetivo, arquivos críticos, passos ordenados, riscos, o que precisa de confirmação humana no meio do caminho.
5. Chame `ExitPlanMode` para apresentar o plano e aguardar aprovação — não comece a codar antes disso.

## PASSO 5 — Começar a execução

Depois de aprovado, comece pelo primeiro passo do plano. Se a tarefa tiver várias etapas, use `TaskCreate`/`TaskUpdate` para acompanhar o progresso.
