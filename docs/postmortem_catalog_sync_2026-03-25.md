# Postmortem: Sincronização acidental de catálogo em produção

**Data do incidente:** ~2026-03-25
**Severidade:** Alta (dados de catálogo alterados em produção)
**Status:** Resolvido manualmente + guardrails implementados

---

## O que aconteceu

Uma sincronização de catálogo (Nuvemshop) foi disparada acidentalmente no ambiente de produção, alterando dados do catálogo real dos clientes.

## Por que o sistema permitiu

1. **Sem detecção de ambiente**: o app não diferenciava produção de desenvolvimento
2. **Sem confirmação**: o botão "Sincronizar" executava a operação diretamente com um clique
3. **Sem indicador visual**: nenhuma indicação de que o admin estava conectado à base de produção
4. **Edge function sem guarda**: a function `sync-nuvemshop` aceitava qualquer POST autenticado sem verificação extra
5. **Mesmo UX em todos os ambientes**: impossível distinguir visualmente se era staging ou produção

## Guardrails implementados

### Frontend
- **Banner de produção**: faixa vermelha fixa "AMBIENTE DE PRODUÇÃO" no topo do admin quando `isProduction = true`
- **Botão visual diferenciado**: botão de sync fica vermelho (em vez de dourado) quando em produção
- **Confirmação por digitação**: em produção, o usuário deve digitar "SINCRONIZAR" para confirmar a operação (Catálogo e Estoque)
- **Detecção de ambiente centralizada**: `src/lib/environment.ts` baseado na URL do Supabase

### Backend (Edge Functions)
- **Header obrigatório `x-confirm-sync: true`**: as edge functions `sync-nuvemshop` e `sync-google-sheets` rejeitam requests sem esse header (HTTP 400)
- **CORS atualizado**: o header customizado está na lista de allowed headers

### Impacto operacional
- Em **desenvolvimento/local**: sync funciona normalmente com um clique (sem alteração de UX)
- Em **produção**: sync exige digitação explícita de "SINCRONIZAR" + botão é visualmente diferenciado + banner permanente

## O que ainda depende de decisão futura

1. **Rate limiting de sync**: limitar a 1 sync por minuto para evitar flood acidental
2. **Dry-run mode**: permitir preview do que vai mudar antes de confirmar
3. **Log de quem disparou**: registrar `admin_id` no `catalog_sync_runs` (hoje é anônimo)
4. **Separação de secrets por ambiente**: usar projetos Supabase separados para staging vs produção
5. **Rollback automático**: snapshot do catálogo antes de sync para facilitar reverter

---

*Documento gerado em 2026-03-25 como parte das medidas preventivas pós-incidente.*
