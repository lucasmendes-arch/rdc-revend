# Trinks — endpoints internos (mapa de integração)

> Base do mapeamento: HARs capturados em 27/07/2026 nas telas Relatório Financeiro,
> Agenda, Serviços, Clientes, Profissionais, Produtos, Controle de Entradas e Saídas
> e Comissões. Achados de sessão validados em 28/07/2026 contra o host de cookies.
>
> O Trinks não expõe API pública neste uso — o que consumimos são os mesmos
> endpoints internos que a interface chama. **Podem mudar sem aviso**: qualquer
> falha de parsing começa a investigação por aqui.

## Autenticação

Não é preciso capturar cookie no DevTools: o host Puppeteer já mantém a sessão
logada por unidade e devolve tudo o que os endpoints precisam.

```
GET http://82.25.74.109:3099/cookies/{1..5}
→ { cookieString, trinksAuth, tokenApi, sessionId, wafToken, idConta, idEstabelecimento }
```

Headers exigidos em toda chamada ao BackOffice:

| Header | Valor |
|---|---|
| `cookie` | `cookieString` do host |
| `id-conta-logado` | `idConta` |
| `id-estabelecimento-autenticado` | `idEstabelecimento` |
| `x-requested-with` | `XMLHttpRequest` |

### Características do host (medidas em 28/07/2026)

- **Só existem as rotas 1–5.** `/cookies/6` e `/cookies/7` retornam 404.
- **Cada login leva 17–47s** (Puppeteer faz login real a cada chamada).
- **Não suporta concorrência**: 5 pedidos quase simultâneos degradaram o serviço
  para HTTP 500, com respostas passando de 200s. Ele roda na mesma VPS do n8n
  (`srv1476439`, 82.25.74.109), que atende também os fluxos de confirmação (17h)
  e feedback (09h) — derrubar o host derruba esses fluxos.
- Por isso o sync usa **cache de sessão** (`trinks_sessions`, 25 min) e o cron
  **escalona** as unidades de 3 em 3 minutos.
- Quando a sessão morre, o Trinks devolve **HTML de login com status 200**, não 401.

### Mapa rota → unidade (confirmado)

| Rota | idEstabelecimento | Nome no Trinks | `stores.slug` | idConta |
|---|---|---|---|---|
| 1 | 241717 | Rei dos Cachos Laranjeiras | `serra` | 3922400 |
| 2 | 194516 | Rei dos Cachos \| Linhares | `linhares` | 2820244 |
| 3 | 207853 | Rei dos Cachos \| Teixeira de Freitas | `teixeira` | 3288855 |
| 4 | 196024 | Rei dos Cachos \| Colatina | `colatina` | 3178071 |
| 5 | 260078 | Rei dos Cachos \| São Gabriel da Palha | `sao-gabriel` | 4129791 |

Duas armadilhas:

1. **A unidade da Serra chama-se "Laranjeiras" no Trinks** (nome do bairro).
2. **Cada unidade tem `idConta` próprio** — não é uma conta franqueadora única.
   Não dá para varrer as unidades trocando só `id-estabelecimento-autenticado`;
   é uma sessão por unidade, mesmo.

Fora do escopo atual: Jaguaré (235273) e Vila Valério (230231) existem no Trinks
mas não têm rota de cookie nem loja em `stores`. A conta `3061627` (a do HAR) é
franqueadora, enxerga as 7 e tem a visão "Consolidado Rei dos Cachos" (Key 420) —
seria o caminho se um dia quisermos cobrir tudo com uma sessão só.

---

## Padrão de exportação CSV (caminho preferido)

Toda tela com botão "Exportar" segue a mesma receita:

```
POST /BackOffice/Download/Exportar{Tela}
body: o mesmo payload de filtro que a tela usa para listar
→ {"Dados":{"Identificador":"...","UrlDownload":"https://prd-exportacoes.s3.amazonaws.com/..."}}
```

`UrlDownload` é um link S3 pré-assinado que **expira em poucos minutos** — baixar
na mesma execução. O CSV vem completo, sem paginação e sem HTML.

| Tela | Endpoint | Aceita período? |
|---|---|---|
| Financeiro | `ExportarFinanceiro` | ✅ `DataInicio`/`DataFim` |
| Comissões | `ExportarComissoes` | ✅ `DataInicio`/`DataFim` |
| Agendamentos | `ExportarAgendamentos` | ✅ `FiltrosAplicados.DataInicio`/`DataFim` |
| Clientes | `ExportarClientes` | ⚠️ opcional (filtra por data de cadastro) |
| Produtos | `ExportarProdutos` | ❌ catálogo |
| Serviços | `ExportarServicos` | ❌ sem payload |

Faz sentido pela natureza do dado: Financeiro/Comissões/Agenda são relatórios de
movimento; Produtos/Serviços/Clientes são cadastros.

> **Regra ao mapear tela nova:** procurar primeiro o botão "Exportar". Se existir,
> não vale a pena parsear HTML.

### Formato dos CSVs (confirmado em 28/07/2026)

**Encoding é Windows-1252, não UTF-8.** Decodificar como UTF-8 transforma
"Serviço" em "Servi&#65533;o" e quebra o casamento de colunas. Ver `decodeCsvBytes`.

Quando **não há movimento no período**, a exportação responde `200` com `Dados`
sem `UrlDownload` — ausência de dado, não erro.

#### `ExportarFinanceiro` — uma linha por FECHAMENTO DE CONTA
Não traz o nome dos itens; traz os totais já separados por natureza:

| Coluna | Uso |
|---|---|
| `Data de Pagamento/Estorno` | `business_date` (**regime de caixa**) |
| `Data de Atendimento/Venda` | ignorada — ver abaixo |
| `Total (R$)` | `gross_revenue` |
| `Total (R$) Serviço` / `Total (R$) Produtos` / `Total (R$) Pacotes` | split oficial |
| `Total (R$) Descontos` | vem **negativo** — guardamos o módulo |
| `Nº Fechamento` | existe no cabeçalho mas **vem vazia** |

Também traz as formas de pagamento (Crédito, Débito, Dinheiro, Pré-Pago, Outros,
Troco, Gorjeta) — ainda não consumidas.

⚠️ Vários cabeçalhos são prefixo uns dos outros (`Total (R$)` × `Total (R$) Serviço`),
então o casamento tem de ser **exato**, nunca por substring. `tickets_count` é a
contagem de linhas, já que `Nº Fechamento` vem vazio.

⚠️ **`TipoData=2` filtra por data de PAGAMENTO.** Um atendimento de abril pago em
maio aparece na exportação de maio. Por isso `business_date` é a data de
pagamento, não a de atendimento — o dashboard é regime de caixa ("quanto entrou
no dia"). Usar a data de atendimento fazia uma janela gravar dias que ela não
cobre: o backfill de maio produziu 34 dias distintos num mês de 31, e o upsert
sobrescrevia dias já corretos com o pedaço parcial que caiu naquele filtro.
Os parsers ainda descartam qualquer linha fora da janela consultada, como trava.

#### `ExportarComissoes` — uma linha por ITEM vendido
Única fonte item-a-item via exportação. Colunas usadas: `Atendimento/Venda`,
`Profissional`, `Serviço/Produto/Pacote`, `Categoria`, `Valor`, `Valor Comissão`.

A `Categoria` é o **tipo do produto**, não a natureza: em Linhares vieram
"Shampoo", "Ativador", "Máscara", "Spray" (produtos) junto de "Hidratações",
"Tratamento", "Combo de serviços", "Mudança de Cor" (serviços). A classificação
usa categoria conhecida **ou** volume no nome (`500ML`, `1L`, `500G`), e o
resultado é conferido contra o total oficial de produtos do CSV financeiro —
divergência acima de 15% vira warning no `trinks_sync_runs`.

Ressalva: com assistente vinculado, o mesmo atendimento pode gerar mais de uma
linha. O ranking serve para ordenar; o faturamento oficial vem do financeiro.

#### `ExportarClientes`
`Data de Cadastro` é o que alimenta `new_customers`.

---

## Endpoints que devolvem JSON limpo

Preferir sempre estes — não exigem parsing.

### Agenda
- `GET /BackOffice/Agenda/ListarHorarios` ⭐ — agendamentos do período.
  Campos: `id`, `pid` (profissional), `start`, `end`, `checkedout`, `servico`,
  `nomecompletocliente`, `idcliest`, `etiquetas`.
  Filtrar fora: `cid` 9998/9999 e `idcliest <= 0` (bloqueios e ausências).
- `GET /BackOffice/Agenda/ListarProfissionais` — `Codigo`, `Descricao`, `Funcao`.
- `GET /BackOffice/Agenda/ListarProfissionaisQueTrabalhamNoDia`
- `GET /BackOffice/Agenda/ListarStatusHorarios` — tabela de status (código+nome+cor).

### Controle de Entradas e Saídas (fluxo de caixa, **não** estoque)
- `GET /Backoffice/ControleDeEntradaESaida/ValoresDeReceitaEDespesa?DataInicio&DataFim`
  → `{"Dados":{"ValorDasDespesas":…,"ValorDasReceitas":…}}`
- `POST /Backoffice/ControleDeEntradaESaida/LancamentosAgrupadosPorData`
  → lançamentos por data, com `TipoDeLancamento`.
- `POST /BackOffice/ControleDeEntradaESaida/ValorDespesasAgrupadasPorCategoria`

### Conta / unidades
- `GET /Login/UsuarioLogado`
- `GET /Backoffice/Estabelecimento/ListarKeyValue?idConta={id}` — lista as unidades.

---

## Endpoints que devolvem `{"Html": "..."}`

Retornam a tabela pronta para renderizar. **Evitar**: usar a exportação CSV
equivalente. Documentados por referência e para drill-down que o CSV não cubra.

### Financeiro (`/BackOffice/Relatorios/Financeiro`)
Payload comum (`x-www-form-urlencoded`):
```
TipoData=2&DataInicio=dd/MM/yyyy&DataFim=dd/MM/yyyy
&ExibirEstornos=false&TipoFiltroTransacaoProduto=0&IdFiltroPorDesconto=0
```
- `POST /BackOffice/Relatorios/ResultadoRelatorioFinanceiro` — nível 1 (por mês)
- `POST /BackOffice/Relatorios/FinanceiroResumoMovimentacao` — card de resumo
- `POST /Backoffice/Relatorios/ExibirSegundaLinhaRelatorioFinanceiro` (+ `mes`, `ano`, `indexLinha`)
- `POST /Backoffice/Relatorios/ExibirTerceiraLinhaRelatorioFinanceiro` (+ `dataSelecionada`, `indexLinha`)

### Comissões (`/BackOffice/Comissao/Relatorio`)
Payload comum:
```
TipoData=2&DataInicio&DataFim&TipoItemPago=0&ExibirEstornos=false
&TipoStatusFiltroPagamento=1&IdRelacaoProfissional=0&temPagamentoProfissional=true
```
4 níveis: `ResultadoRelatorioComissoes` → `ExibirProfissionaisRelatorioComissoes`
→ `ExibirSegundaLinhaRelatorioComissoes` → `ExibirTerceiraLinhaRelatorioComissoes`.

### Serviços
- `POST /BackOffice/Servicos/ObterListaDeCategoriasEServicos`

### Produtos
- `GET /BackOffice/Produtos/ParteListaProdutos` — uma chamada por categoria
- `POST /BackOffice/Produtos/Filtrar` — busca por texto (texto vazio **não** traz tudo)

Ambos exigem `__RequestVerificationToken` (anti-CSRF do ASP.NET), que precisa ser
extraído do HTML da página a cada sessão. Mais um motivo para preferir
`ExportarProdutos`.

### Profissionais
`/BackOffice/ManterCadastro/Profissional` **não usa AJAX** — a lista vem no HTML
da própria página, em `<table id="tabela-profissionais">`.

---

## Como isso é consumido aqui

`supabase/functions/sync-trinks/` — `trinks.ts` tem o cliente e os parsers,
`index.ts` orquestra e grava. Ver `docs/SCHEMA.md` para as tabelas `trinks_*`.

Rodar a função com `{"probe": true}` devolve os cabeçalhos reais, uma amostra
dos dados e as categorias encontradas — sem gravar nada. É o primeiro passo
sempre que algo parecer errado.

### Pendências conhecidas

1. **`no_shows` / `cancellations` sempre 0** — `ListarHorarios` não devolve
   status textual no objeto; só `checkedout`. Para preencher, é preciso
   identificar o código de status via `ListarStatusHorarios` e cruzar.
2. **Agenda futura não aparece** — o filtro `StatusSelecionados` em uso
   (`9999,3,4,6,7,8`) cobre os estados de atendimento já ocorrido. Para ver o
   que ainda vai acontecer no dia, falta incluir o status de "agendado".
3. **Formas de pagamento** do CSV financeiro ainda não são persistidas.

> **`UrlDownload` ausente é ambíguo** — pode ser período sem movimento *ou*
> falha transitória da exportação. Confirmado em 28/07/2026: Teixeira/set-2025
> voltou vazia no backfill (entre 40,7k em agosto e 28,7k em outubro) e trouxe
> 707 linhas na retentativa imediata. Por isso `exportCsv` tenta 2 vezes antes
> de desistir. Se voltar vazio nas duas, aí sim é ausência de dado — foi o caso
> de Laranjeiras antes de nov/2025 e São Gabriel antes de fev/2026, que são as
> datas de abertura dessas unidades.

---

## Webhook oficial (fonte atual, desde 08/10/2026)

O login automatizado (host Puppeteer `/root/trinks-auth` na VPS) está barrado
pelo **AWS WAF** do Trinks desde 30/09/2026: o Chromium recebe a página de desafio
(`gokuProps`) e expira em "Navigation timeout"; `curl www.trinks.com/Login` → 403.
Decisão: não tentar contornar o WAF. A fonte do dashboard passa a ser o webhook.

```
Trinks ──SNS──► n8n "WebHook Trinks" (/webhook/1232b74f-…)
                 ├─► "Grava evento no Supabase" → edge function trinks-webhook
                 │       valida assinatura AWS → trinks_webhook_events
                 └─► "Responde ao SNS" (200 só depois de gravar)
```

- O webhook já estava cadastrado no Trinks e entregando ~90–190 eventos/dia, mas o
  workflow estava **desativado**: tudo recebia 404 e se perdeu (log do n8n, 01–08/10).
  Ativado em 08/10/2026 ~22h20.
- O corpo vai **bruto** (Webhook com `rawBody`, HTTP Request com `binaryData`): a
  assinatura cobre os campos exatamente como a AWS enviou.
- Se a gravação falhar, o n8n responde 500 e o **SNS reentrega** — não há perda
  silenciosa. Duplicatas são descartadas pelo `MessageId`.
- Os repasses antigos (Fechamento Conta, Boas Vindas, Novo Agendamento) estão
  **desativados** no workflow: os fluxos de destino estão desligados e o "Boas
  Vindas" manda WhatsApp para cliente.
- `TRINKS_SNS_TOPIC_ARNS` (secret da função, opcional) restringe os tópicos aceitos.
  Preencher com o `topic_arn` dos primeiros eventos reais.
- `SubscriptionConfirmation` é gravada mas **não confirmada automaticamente**.
- O webhook só cobre o que acontece a partir da ativação. O período de 28/07 até
  08/10 precisa vir de importação de CSV exportado pela tela.

Payloads documentados em https://trinks.readme.io/reference/webhook. Os campos
reais devem ser conferidos em `trinks_webhook_events.payload` antes de construir a
camada de processamento.

---

## Importação de relatórios exportados (histórico)

`npx tsx scripts/trinks-import.ts relatorios-trinks/<slug>` — pasta por unidade
(`stores.slug`), fora do git (dados pessoais). Idempotente por sha256; cada
arquivo substitui o seu período numa transação e recalcula o dashboard.

| Relatório (tela do Trinks) | Filtro obrigatório | Tabela | Alimenta |
|---|---|---|---|
| Financeiro | Data de Pagamento/Estorno | `trinks_transactions` | faturamento, comandas, pagamentos, descontos, recorrência |
| Clientes (ativos) | — | `trinks_clients` | clientes novos, cadastro |
| Agendamentos | — (data do agendamento) | `trinks_appointments` | agenda, faltas, cancelamentos |
| Comissões | Data de Pagamento/Estorno | `trinks_sale_items` | rankings de serviço/produto, produção e comissão por profissional |
| Ranking de Profissionais | — | ignorado | resumo sem data por linha |

Armadilhas encontradas nos arquivos reais (Linhares, 08/10/2026):
- **Aspas não escapadas** em nomes de cliente: um parser estrito perdia 3,5 mil de
  6,3 mil clientes. O tokenizador só fecha aspa antes de `;`/quebra/fim, e recusa
  campo > 5000 caracteres.
- **Cabeçalho de Agendamentos muda** com a época (2026 ganhou "Etiqueta do
  agendamento" no meio): colunas localizadas pelo nome.
- **"% Comissão" = "comissão informada"** quando a comissão é valor fixo.
- **Serviço × produto** nas comissões: é serviço o item cujo nome aparece nos
  agendamentos. Serviços batem 100% com o financeiro; produtos 99,7%.
- Financeiro e Comissões trazem linha de **Total**; a soma tem de bater ou o
  arquivo é recusado.
