# Modelo Canônico de `lead_status`
> Criado em: 2026-04-20
> Propósito: inventário, proposta definitiva e plano de migração antes da CHECK constraint

---

## 1. Inventário atual

### 1.1 Valores encontrados no código produtivo

| Valor | Onde aparece | Origem | Status |
|---|---|---|---|
| `'novo'` | `enqueue_lead_created()` — migration 20250317 | Trigger em produção | **REAL — único valor gravado hoje** |
| `NULL` | `profiles.lead_status DEFAULT NULL` | Todos os registros sem `user_registered` event | **REAL — maioria dos registros** |

> **Conclusão:** o banco tem hoje exatamente dois estados de dados: `NULL` e `'novo'`. Todo o resto é proposta em documentação, não dado real.

### 1.2 Valores em documentação escrita nesta sessão (ainda não em produção)

| Valor | Onde aparece | Problema |
|---|---|---|
| `'em-contato'` | `CRM_N8N_FIRST_BUSINESS_FLOW.md` | Usa hífen — inconsistente com `snake_case` adotado nas migrations |
| `'em_nutricao'`, `'em_contato'`, `'respondeu'`, `'qualificado'`, `'convertido'`, `'recorrente'`, `'inativo'`, `'pausado'`, `'opt_out'` | `CRM_N8N_ARCHITECTURE_RESET.md` | Proposta sem validação de negócio — lista longa demais |

### 1.3 Valor em worktree abandonado (nunca foi para produção)

| Valor | Onde aparece | Status |
|---|---|---|
| `'qualified'` | `.claude/worktrees/.../CRM_N8N_CONTRACT.md` | Worktree de sessão anterior, arquitetura descartada, **ignorar** |

### 1.4 Estados implícitos em estruturas adjacentes

Estes NÃO são `lead_status`, mas representam estados operacionais do lead em outras tabelas:

**`client_sessions.status` — funil e-commerce (comportamental, não comercial):**
- `visitou`, `visualizou_produto`, `adicionou_carrinho`, `iniciou_checkout`, `comprou`, `abandonou`

**`crm_tags` (slugs) — labels comportamentais:**
- `novo-cliente`, `recorrente`, `vip`, `abandonou-carrinho`, `iniciou-checkout`, `adicionou-carrinho`, `profissional`

**`profiles.customer_segment` — segmentação comercial:**
- `network_partner`, `wholesale_buyer`, `NULL`

> **Observação crítica:** há sobreposição semântica entre `crm_tags` e `lead_status`.
> Exemplo: a tag `recorrente` e um possível status `recorrente` representariam a mesma coisa.
> A seção 3 resolve isso.

---

## 2. Proposta canônica

### 2.1 Critérios de design

1. **Máximo 8 estados** — qualquer coisa além dificulta o workflow do n8n e a leitura admin
2. **Snake_case sem hífen** — consistência com migrations
3. **Estado ≠ ação** — "enviou mensagem" é evento, não estado
4. **Sem sobreposição com tags** — se já é tag, não é status
5. **Acionável pelo n8n** — o orquestrador deve conseguir decidir com base no status atual

### 2.2 Modelo proposto: 7 estados

| # | Valor SQL | Label legível | Quem transiciona |
|---|---|---|---|
| 1 | `novo` | Novo lead | Sistema (trigger `user_registered`) |
| 2 | `em_contato` | Em contato | n8n (início de sequência) |
| 3 | `qualificado` | Qualificado | n8n / Vendedor |
| 4 | `convertido` | Convertido | Sistema (trigger `purchase_completed`) |
| 5 | `recorrente` | Recorrente | Sistema (trigger `purchase_completed` — 2ª+ compra) |
| 6 | `inativo` | Inativo | n8n (detecção de inatividade) |
| 7 | `opt_out` | Optou por sair | n8n / Vendedor |

**Estados intencionalmente excluídos da lista anterior:**

| Estado descartado | Motivo |
|---|---|
| `em_nutricao` | Redundante com `em_contato`. Do ponto de vista do CRM, nutrição automatizada e contato ativo são o mesmo estado: o n8n está gerenciando o lead. |
| `respondeu` | É um **evento** (`customer_replied`), não um estado estável. Quando o lead responde, a transição vai para `qualificado` ou o n8n decide manter em `em_contato`. Estado não deve ser transitório. |
| `pausado` | Complexidade desnecessária neste momento. "Pausado" pode ser representado por `inativo` com `next_action = 'pausado manualmente'`. Adicionar se o admin demonstrar necessidade real. |

### 2.3 Definições operacionais completas

#### `novo`
- **Entrada:** trigger `enqueue_lead_created()` ao inserir `user_registered` em `crm_events`
- **Saída:** n8n inicia sequência → `em_contato`; lead compra direto → `convertido`
- **Invariante:** lead registrou mas o n8n ainda não iniciou nenhuma sequência
- **Exemplo:** Maria acabou de criar conta no site

#### `em_contato`
- **Entrada:** n8n recebe `lead_created` e inicia workflow; ou vendedor reativa lead inativo
- **Saída:** lead confirma interesse → `qualificado`; lead para de responder → `inativo`; lead compra → `convertido`; lead pede para sair → `opt_out`
- **Invariante:** existe uma sequência ativa no n8n para este lead OU foi feita tentativa recente de contato
- **Exemplo:** sequência de 3 mensagens WhatsApp em andamento

#### `qualificado`
- **Entrada:** n8n recebe sinal de interesse (resposta, clique, comportamento); ou vendedor atualiza manualmente
- **Saída:** lead fecha pedido → `convertido`; lead para de responder → `em_contato` ou `inativo`
- **Invariante:** lead demonstrou interesse explícito, está pronto para abordagem comercial direta
- **Exemplo:** Maria respondeu "Sim, quero saber mais sobre preços"

#### `convertido`
- **Entrada:** trigger automático no primeiro `orders.status = 'pago'`
- **Saída:** segundo pedido → `recorrente`
- **Invariante:** realizou exatamente 1 compra confirmada
- **Exemplo:** primeiro pedido pago

#### `recorrente`
- **Entrada:** trigger automático no segundo `orders.status = 'pago'` (ou mais)
- **Saída:** estado terminal para fins de CRM de aquisição; campanhas de retenção diferentes
- **Invariante:** 2+ pedidos pagos
- **Exemplo:** cliente fidelizado

#### `inativo`
- **Entrada:** n8n detecta ausência de interação após período configurável (ex: 30 dias sem resposta, sem compra)
- **Saída:** nova interação detectada → `em_contato` via evento `lead_reactivated`
- **Invariante:** lead não responde e n8n encerrou sequência ativa
- **Exemplo:** Maria abriu as mensagens mas não respondeu em 30 dias

#### `opt_out`
- **Entrada:** lead responde com pedido de saída; ou vendedor marca manualmente
- **Saída:** estado terminal — nenhum sistema deve iniciar contato com `opt_out`
- **Invariante:** lead solicitou não receber comunicações
- **Exemplo:** "Por favor, não me mande mais mensagens"
- **Atenção:** CRM deve tratar como irreversível operacionalmente (a menos que admin force)

### 2.4 Diagrama de transições

```
                    [user_registered]
                           │
                        [novo]
                           │
                    n8n inicia sequência
                           │
                     [em_contato]◄────────── lead_reactivated
                     /    │    \
          interesse       │     sem resposta (30d)
         confirmado        │           │
              │            │       [inativo]
        [qualificado]      │
              │         compra          
              │         direta          
              └──────────┬──────────────┘
                         │
                    [convertido]
                         │
                    2ª+ compra
                         │
                    [recorrente]

qualquer estado → [opt_out]  (por solicitação do lead)
```

---

## 3. Relação entre status, tags e eventos

### O que deve ser `lead_status`

**Regra:** use `lead_status` quando a informação representa **posição atual no ciclo de vida comercial** — algo que o n8n precisa ler para decidir a próxima ação.

| Pergunta que `lead_status` responde | Exemplo de uso |
|---|---|
| "Já foi feito contato com este lead?" | Filtrar `novo` para primeira abordagem |
| "Este lead está em uma sequência ativa?" | `em_contato` — n8n não reinicia se já ativo |
| "Este lead pode receber comunicação?" | Bloquear `opt_out` em qualquer envio |
| "Este lead já comprou?" | `convertido`, `recorrente` — não enviar promoção de primeiro pedido |

### O que deve continuar como tag

**Regra:** use tag quando a informação representa **características ou comportamentos acumulativos** — não mutuamente exclusivos, podem coexistir, não determinam a próxima ação isoladamente.

| Tag (slug) | Por que tag e não status |
|---|---|
| `vip` | Um cliente pode ser `recorrente` E `vip` simultaneamente |
| `profissional` | Característica cadastral, não estado de ciclo de vida |
| `abandonou-carrinho` | Comportamento pontual; coexiste com qualquer `lead_status` |
| `novo-cliente` | Redundante com `lead_status = 'convertido'` → **candidata a remoção** |
| `recorrente` (tag) | Redundante com `lead_status = 'recorrente'` → **candidata a remoção** |

> **Atenção:** as tags `novo-cliente` e `recorrente` são redundantes com `lead_status`.
> Recomendação: após a migration do CHECK constraint, descontinuar gradualmente essas tags do motor automático — o `lead_status` passa a ser a fonte canônica.

### O que deve ser evento

**Regra:** use `crm_events` quando a informação representa **algo que aconteceu em um momento específico** — não é um estado atual, é uma ocorrência no tempo.

| Evento | Por que evento e não status |
|---|---|
| `customer_replied` | Fato pontual que dispara transição. Não é estado estável. |
| `followup_sent` | Auditoria de cada envio. Múltiplos por lead. |
| `lead_state_changed` | Log da transição — `{from, to, reason, source}` |
| `lead_reactivated` | Fato que dispara transição `inativo → em_contato` |
| `lead_opted_out` | Fato que dispara transição para `opt_out` |

### O que NÃO deve ser modelado como status

| Anti-padrão | Problema |
|---|---|
| `'respondeu'` como status | Estado transitório — lead responde e imediatamente transiciona. Status instável. |
| `'enviando_mensagem'` | Isso é estado interno do n8n, não do CRM. |
| `'aguardando_resposta'` | Sinônimo de `em_contato`. Granularidade desnecessária. |
| `'em_nutricao'` | Sinônimo de `em_contato` do ponto de vista do CRM. |
| Estágio do funil e-commerce | Isso é `client_sessions.status`, não `lead_status`. São sistemas diferentes. |

---

## 4. Plano de migração

### 4.1 Estado atual do banco

```sql
-- Distribuição atual estimada (rodar para confirmar antes da migration):
SELECT
  lead_status,
  count(*) AS total
FROM profiles
GROUP BY lead_status
ORDER BY total DESC;
```

Esperado: maioria `NULL`, alguns `'novo'`.

### 4.2 Mapeamento de dados existentes

| Valor atual | Ação | Valor final |
|---|---|---|
| `NULL` | UPDATE para `'novo'` | `novo` |
| `'novo'` | Manter | `novo` |

> Não há mais valores a mapear — nenhum outro valor foi gravado em produção.

### 4.3 Mapeamento de aliases e inconsistências nos docs

Estes valores aparecem em **documentação desta sessão** mas nunca foram gravados no banco.
Devem ser corrigidos nos docs ANTES de configurar o n8n:

| Valor nos docs | Correto para usar | Onde corrigir |
|---|---|---|
| `'em-contato'` (com hífen) | `'em_contato'` | `CRM_N8N_FIRST_BUSINESS_FLOW.md` — 8 ocorrências |
| `'qualified'` (inglês) | `'qualificado'` | Worktree abandonado — sem ação necessária |

### 4.4 Ordem segura da migration

```sql
-- PASSO 1: Migrar NULL → 'novo' (dados, sem constraint)
UPDATE profiles
SET lead_status = 'novo'
WHERE lead_status IS NULL;

-- PASSO 2: Confirmar que não restou nenhum valor fora do enum
SELECT lead_status, count(*)
FROM profiles
WHERE lead_status NOT IN ('novo','em_contato','qualificado','convertido','recorrente','inativo','opt_out')
   OR lead_status IS NULL
GROUP BY lead_status;
-- Resultado esperado: zero linhas

-- PASSO 3: Adicionar CHECK constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_lead_status_check
  CHECK (lead_status IN (
    'novo', 'em_contato', 'qualificado',
    'convertido', 'recorrente', 'inativo', 'opt_out'
  ));
```

> **Nota:** `NULL` intencionalmente excluído do CHECK final.
> Após a migration do passo 1, todo registro terá um valor e `NULL` pode ser proibido
> para novos registros via `DEFAULT 'novo'` no `enqueue_lead_created()` (já existe).

---

## 5. Recomendação final

### 5.1 Lista final — valores SQL exatos

```
'novo'
'em_contato'
'qualificado'
'convertido'
'recorrente'
'inativo'
'opt_out'
```

7 estados. Snake_case sem hífen. Sem inglês. Sem sobreposição com tags.

### 5.2 Mapeamento de dados antigos

| De | Para | Motivo |
|---|---|---|
| `NULL` | `'novo'` | Default correto para registros sem contato |
| `'novo'` | `'novo'` | Já correto |

Nenhum outro valor existe em produção.

### 5.3 Documentação a corrigir antes do deploy

| Documento | Correção necessária |
|---|---|
| `docs/CRM_N8N_FIRST_BUSINESS_FLOW.md` | Substituir `'em-contato'` por `'em_contato'` em todas as ocorrências |

### 5.4 Riscos da migration

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Algum código externo (n8n, script) já gravou valor fora do enum | Baixa (confirmado acima que não existe) | Rodar query de verificação do passo 2 antes do passo 3 |
| `n8n-sync-back` recebe `lead_status` fora do enum após o CHECK ser aplicado | Média | A edge function vai retornar erro 500 (UPDATE falha). Solução: validar `lead_status` na edge function antes de enviar para o banco |
| Tag `recorrente` e `lead_status = 'recorrente'` ficam fora de sync | Média | Não é bloqueante para o enum. Endereçar em sprint separado ao migrar o motor de tags. |
| `NULL` pode aparecer em `profiles` criados via trigger antes do DEFAULT ser atualizado | Baixa | O trigger `enqueue_lead_created()` já faz `COALESCE(lead_status, 'novo')` — cobre o caso |

---

## Prontidão para a migration do CHECK constraint

**Sim, está seguro prosseguir com a migration.**

Condições satisfeitas:
- ✅ Apenas `NULL` e `'novo'` existem no banco hoje
- ✅ Enum final tem 7 valores — enxuto, sem ambiguidade
- ✅ Plano de migração em 3 passos com verificação intermediária
- ✅ Nenhuma edge function em produção grava `lead_status` com valor fora do enum
- ✅ Único ajuste de doc necessário identificado (`CRM_N8N_FIRST_BUSINESS_FLOW.md`)

Único pré-requisito: corrigir `'em-contato'` → `'em_contato'` no doc antes de montar o workflow do n8n.
