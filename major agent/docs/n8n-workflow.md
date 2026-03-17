# BaseOp — Workflow n8n: `baseop-intake`

## Visão Geral

```
[Webhook Trigger] → [Validate Secret] → [Switch Command] → [OpenAI Branch] → [Supabase Insert] → [Telegram Reply]
                                                                                                  ↗
                                                                         [Error Handler] --------
```

O workflow recebe o payload padronizado da Vercel Edge Function, classifica o comando, enriquece com OpenAI, persiste no Supabase e responde ao usuário no Telegram.

---

## Nó 1: Webhook Trigger

- **Tipo:** Webhook
- **Método:** POST
- **Path:** `baseop-intake`
- **Authentication:** Header Auth
- **URL resultante:** `http://<vps-ip>:5678/webhook/baseop-intake`

**Output esperado (vindo da Edge Function):**

```json
{
  "telegram_message_id": "12345",
  "chat_id": "67890",
  "user_id": 123456789,
  "username": "lucas",
  "first_name": "Lucas",
  "command": "insight",
  "payload": "Shampoo premium tem margem 3x maior que linha básica",
  "raw_text": "/insight Shampoo premium tem margem 3x maior que linha básica",
  "timestamp": 1710500000
}
```

---

## Nó 2: Validate Secret

- **Tipo:** IF
- **Condição:** `{{ $request.headers['x-n8n-secret'] }}` === `{{ $env.N8N_WEBHOOK_SECRET }}`
- **True:** continua para Switch
- **False:** Respond to Webhook com status 401

---

## Nó 3: Switch Command

- **Tipo:** Switch
- **Campo:** `{{ $json.command }}`
- **Branches:**

| Output | Valor | Descrição |
|--------|-------|-----------|
| 0 | `insight` | Ideia, observação, hipótese |
| 1 | `project` | Criar/atualizar projeto |
| 2 | `radar` | Oportunidade ou sinal de mercado |
| 3 | `search` | Pesquisa contextualizada |
| 4 | `me` | Registro pessoal/reflexão |
| 5 | `task` | Criar tarefa |
| 6 | `content` | Gerar variações de conteúdo |
| 7 (fallback) | `null` / qualquer outro | Entrada livre (note) |

---

## Nós 4.x: OpenAI por Branch

Cada branch do Switch conecta a um nó OpenAI dedicado com prompt especializado.

- **Tipo:** OpenAI (Chat Model)
- **Model:** `gpt-4o-mini`
- **Temperature:** 0.3 (classificação precisa)
- **Response Format:** JSON

### 4.1 — Branch `insight`

**System prompt:**
```
Você é um assistente de produtividade. O usuário enviou um insight.
Analise e retorne JSON com:
- resumo: frase curta (max 100 chars) com a tese central
- tags: array de 1-3 tags relevantes (lowercase, sem #)
- project_hint: nome de projeto possivelmente relacionado ou null
- resposta_usuario: confirmação breve e amigável para enviar no Telegram
```

**User message:** `{{ $json.payload }}`

---

### 4.2 — Branch `project`

**System prompt:**
```
Você é um assistente de produtividade. O usuário quer criar ou referenciar um projeto.
Analise e retorne JSON com:
- nome: nome limpo do projeto (max 60 chars)
- objetivo: objetivo identificado ou null
- estagio: um de [descoberta, planejamento, execução, aguardando, pausado, concluído]. Default: descoberta
- proxima_acao: próxima ação sugerida ou null
- tags: array de 1-3 tags
- resposta_usuario: confirmação com nome do projeto e estágio
```

**User message:** `{{ $json.payload }}`

---

### 4.3 — Branch `radar`

**System prompt:**
```
Você é um assistente de produtividade focado em oportunidades de negócio.
O usuário identificou um sinal de mercado ou oportunidade.
Analise e retorne JSON com:
- resumo: descrição curta da oportunidade (max 120 chars)
- urgencia: alta, media ou baixa
- area_impacto: área de negócio afetada (ex: vendas, produto, marketing)
- acao_recomendada: o que fazer a seguir (1 frase)
- tags: array de 1-3 tags
- project_hint: projeto possivelmente relacionado ou null
- resposta_usuario: confirmação com indicador de urgência
```

**User message:** `{{ $json.payload }}`

---

### 4.4 — Branch `search`

**System prompt:**
```
Você é um assistente de pesquisa. Contexto do usuário: empreendedor no mercado de beleza, SaaS, automações e conteúdo digital.
Pesquise e responda a dúvida com foco prático.
Retorne JSON com:
- resumo: resposta direta em 2-3 frases
- detalhes: resposta completa (max 500 chars) — esta será enviada ao usuário
- tags: array de 1-3 tags do tema
- project_hint: projeto possivelmente relacionado ou null
- resposta_usuario: a resposta completa formatada para Telegram (pode usar markdown básico)
```

**User message:** `{{ $json.payload }}`

---

### 4.5 — Branch `me`

**System prompt:**
```
Você é um assistente pessoal empático. O usuário compartilhou uma reflexão pessoal.
NÃO julgue. Identifique padrões úteis.
Retorne JSON com:
- resumo: essência do registro em 1 frase neutra
- padrao: padrão emocional ou cognitivo identificado (ex: "fadiga decisória", "entusiasmo com novo projeto") ou null
- tags: array de 1-2 tags (ex: energia, foco, frustração)
- resposta_usuario: resposta breve, acolhedora e sem julgamento
```

**User message:** `{{ $json.payload }}`

---

### 4.6 — Branch `task`

**System prompt:**
```
Você é um assistente de produtividade. O usuário quer criar uma tarefa.
Extraia as informações e retorne JSON com:
- titulo: título limpo e actionable da tarefa (max 80 chars)
- descricao: detalhes adicionais ou null
- prioridade_sugerida: alta, media ou baixa
- project_hint: projeto possivelmente relacionado ou null
- tags: array de 1-2 tags
- resposta_usuario: confirmação com título da tarefa
```

**User message:** `{{ $json.payload }}`

---

### 4.7 — Branch `content`

**System prompt:**
```
Você é um copywriter direto e pessoal. O usuário quer gerar conteúdo para redes.
Analise o tema/link e retorne JSON com:
- tema: tema central identificado
- angulo: ângulo editorial sugerido
- variacoes: array de 3 strings, cada uma é um post curto em tom direto e pessoal (max 280 chars cada)
- tags: array de 1-3 tags
- project_hint: projeto possivelmente relacionado ou null
- resposta_usuario: as 3 variações formatadas para Telegram (numeradas)
```

**User message:** `{{ $json.payload }}`

---

### 4.8 — Branch `note` (fallback)

**System prompt:**
```
Você é um assistente de produtividade. O usuário enviou uma mensagem livre sem comando.
Analise e retorne JSON com:
- resumo: resumo em 1 frase do conteúdo
- tipo_sugerido: qual tipo seria mais adequado (insight, radar, me, task, content) ou "note" se não se encaixa
- tags: array de 1-3 tags
- project_hint: projeto possivelmente relacionado ou null
- resposta_usuario: confirmação breve de que a nota foi registrada, e sugerir o comando ideal se tipo_sugerido != "note"
```

**User message:** `{{ $json.payload }}`

---

## Nós 5.x: Resolver Project (condicional)

Após cada nó OpenAI, um nó condicional verifica se `project_hint` não é null.

- **Tipo:** IF
- **Condição:** `{{ $json.project_hint }}` is not empty

**Se true → Nó Supabase HTTP:**
- **Tipo:** HTTP Request
- **Method:** GET
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/projects?nome=ilike.*{{ $json.project_hint }}*&select=id,nome&limit=1`
- **Headers:**
  - `apikey`: `{{ $env.SUPABASE_SERVICE_KEY }}`
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_KEY }}`
- **Output:** `project_id` do primeiro resultado, ou null se vazio

**Se false:** `project_id = null`

---

## Nós 6.x: Inserir no Supabase

### 6.1 — Insert Entry (insight, radar, me, search, content, note)

- **Tipo:** HTTP Request
- **Method:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/entries`
- **Headers:**
  - `apikey`: `{{ $env.SUPABASE_SERVICE_KEY }}`
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_KEY }}`
  - `Content-Type`: `application/json`
  - `Prefer`: `return=representation`
- **Body:**
```json
{
  "tipo": "{{ $node['Switch Command'].json.command ?? 'note' }}",
  "conteudo": "{{ $node['Webhook Trigger'].json.payload }}",
  "resumo": "{{ $json.resumo }}",
  "tags": {{ $json.tags }},
  "project_id": "{{ $node['Resolve Project'].json.project_id ?? null }}",
  "origem": "telegram",
  "telegram_message_id": "{{ $node['Webhook Trigger'].json.telegram_message_id }}",
  "processed": true
}
```

### 6.2 — Insert/Upsert Project (comando /project)

- **Tipo:** HTTP Request
- **Method:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/projects`
- **Headers:** (mesmos acima + `Prefer: return=representation`)
- **Body:**
```json
{
  "nome": "{{ $json.nome }}",
  "objetivo": "{{ $json.objetivo }}",
  "estagio": "{{ $json.estagio }}",
  "proxima_acao": "{{ $json.proxima_acao }}",
  "tags": {{ $json.tags }}
}
```

Além disso, criar uma entry do tipo `note` registrando a criação/atualização do projeto.

### 6.3 — Insert Task (comando /task)

- **Tipo:** HTTP Request
- **Method:** POST
- **URL:** `{{ $env.SUPABASE_URL }}/rest/v1/tasks`
- **Body:**
```json
{
  "titulo": "{{ $json.titulo }}",
  "descricao": "{{ $json.descricao }}",
  "project_id": "{{ $node['Resolve Project'].json.project_id ?? null }}",
  "status": "pendente"
}
```

### 6.4 — Insert Message (todas as branches)

Após inserir na tabela principal, inserir a mensagem na tabela `messages` para histórico:

- **Passo 1:** Chamar RPC `get_or_create_conversation` com `p_chat_id = chat_id`
- **Passo 2:** Insert 2 mensagens (user + assistant):

```json
[
  {
    "conversation_id": "{{ conversation_id }}",
    "role": "user",
    "content": "{{ raw_text }}",
    "command": "{{ command }}",
    "metadata": {}
  },
  {
    "conversation_id": "{{ conversation_id }}",
    "role": "assistant",
    "content": "{{ resposta_usuario }}",
    "command": null,
    "metadata": { "entry_id": "{{ entry_id }}" }
  }
]
```

---

## Nó 7: Telegram Reply

- **Tipo:** HTTP Request
- **Method:** POST
- **URL:** `https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage`
- **Body:**
```json
{
  "chat_id": "{{ $node['Webhook Trigger'].json.chat_id }}",
  "text": "{{ $json.resposta_usuario }}",
  "parse_mode": "Markdown"
}
```

---

## Nó 8: Error Handler

Cada branch tem um Error Trigger conectado que:

1. Loga o erro com contexto (comando, chat_id, erro)
2. Envia mensagem amigável ao usuário:

```
❌ Algo deu errado ao processar sua mensagem. Tente novamente em alguns segundos.
```

---

## Variáveis de Ambiente no n8n

Configurar em Settings → Variables:

| Variável | Valor |
|----------|-------|
| `N8N_WEBHOOK_SECRET` | Secret compartilhado com a Edge Function |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key do Supabase |
| `OPENAI_API_KEY` | API key da OpenAI |
| `TELEGRAM_BOT_TOKEN` | Token do bot do Telegram |

---

## Diagrama de Conexões

```
Webhook Trigger
  └─→ Validate Secret
       ├─→ [false] Respond 401
       └─→ [true] Switch Command
            ├─→ insight  → OpenAI 4.1 → Resolve Project → Insert Entry → Insert Messages → Telegram Reply
            ├─→ project  → OpenAI 4.2 → Insert Project + Entry → Insert Messages → Telegram Reply
            ├─→ radar    → OpenAI 4.3 → Resolve Project → Insert Entry → Insert Messages → Telegram Reply
            ├─→ search   → OpenAI 4.4 → Resolve Project → Insert Entry → Insert Messages → Telegram Reply
            ├─→ me       → OpenAI 4.5 → Insert Entry → Insert Messages → Telegram Reply
            ├─→ task     → OpenAI 4.6 → Resolve Project → Insert Task + Entry → Insert Messages → Telegram Reply
            ├─→ content  → OpenAI 4.7 → Resolve Project → Insert Entry → Insert Messages → Telegram Reply
            └─→ fallback → OpenAI 4.8 → Resolve Project → Insert Entry → Insert Messages → Telegram Reply
```

Cada branch tem um Error Handler paralelo que captura falhas e envia mensagem amigável ao Telegram.

---

## Notas de Implementação

1. **Ordem de montagem no n8n:** Criar o webhook primeiro, testar com curl, depois adicionar branches uma a uma começando por `note` (fallback) que é o mais simples.

2. **Testar com curl:**
```bash
curl -X POST http://<vps>:5678/webhook/baseop-intake \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: seu_secret" \
  -d '{
    "telegram_message_id": "test-001",
    "chat_id": "12345",
    "user_id": 1,
    "username": "test",
    "first_name": "Test",
    "command": null,
    "payload": "Testando o sistema BaseOp",
    "raw_text": "Testando o sistema BaseOp",
    "timestamp": 1710500000
  }'
```

3. **gpt-4o-mini** é suficiente para classificação e resumo. Trocar para `gpt-4o` só se a qualidade dos resumos não for boa.

4. **Supabase HTTP nodes** usam a REST API (PostgREST) com service_role key. Para a RPC `get_or_create_conversation`, usar POST em `/rest/v1/rpc/get_or_create_conversation`.
