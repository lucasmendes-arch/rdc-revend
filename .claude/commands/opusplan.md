---
description: Modo de trabalho — Opus planeja, Sonnet/Opus executam por complexidade
---

Ative o modo **OpusPlan** para a tarefa: $ARGUMENTS

## Como operar neste modo

**PASSO 1 — Planejar com Opus**
Use `Agent` com `subagent_type: "Plan"` e `model: "opus"`.
O plano deve listar: objetivo, arquivos críticos, passos ordenados, riscos e o que requer confirmação antes de executar.

**PASSO 2 — Apresentar o plano ao usuário**
Mostre o plano e aguarde aprovação antes de executar.

**PASSO 3 — Executar com o modelo correto**

Para cada passo do plano, escolha o modelo:

| Tipo de tarefa | Modelo |
|---|---|
| Leitura, análise, edits pontuais | `sonnet` |
| Bugs simples, ajustes incrementais | `sonnet` |
| Migration com lógica crítica | `opus` |
| Edge function nova ou refactor estrutural | `opus` |
| RLS, segurança, políticas críticas | `opus` |
| Múltiplas dependências entre passos | `opus` |
| Decisões arquiteturais | `opus` |

Use `Agent` com `model: "sonnet"` ou `model: "opus"` conforme a tabela acima.
Para passos simples sem necessidade de subagente, execute diretamente (você já está em Sonnet).
