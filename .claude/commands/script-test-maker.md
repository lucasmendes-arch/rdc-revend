---
description: Cria e salva script de teste padronizado para funções SQL, RPCs, edge functions ou comportamentos críticos do sistema
---

Crie um script de teste para: $ARGUMENTS

## O que fazer

1. **Entender o alvo.** Se $ARGUMENTS estiver vazio, perguntar qual função/comportamento será testado.

2. **Consultar o schema.** Ler `docs/SCHEMA.md` para entender tipos, colunas e convenções antes de escrever qualquer query.

3. **Escolher o formato correto:**
   - Funções SQL / RPCs / triggers → script `.sql` em `supabase/tests/`
   - Edge functions → script `.sh` com `curl` em `supabase/tests/`
   - Comportamentos frontend → checklist manual em `supabase/tests/`

4. **Escrever o script seguindo este padrão:**
   - Nome do arquivo: `test_<nome_da_funcao_ou_comportamento>.sql` (ou `.sh`)
   - Cabeçalho com: o que testa, pré-condições, como executar
   - Usar queries simples e separadas — sem DO blocks complexos (SQL Editor do Supabase tem limitações)
   - Cobrir: caminho feliz, edge cases relevantes, limpeza de dados de teste
   - Ao final, incluir bloco de **verificação** que confirma o resultado esperado

5. **Salvar o arquivo** em `supabase/tests/`.

6. **Atualizar o índice** em `supabase/tests/README.md` — adicionar uma linha com arquivo, o que testa e funções cobertas.

7. **Responder** com:
   - Caminho do arquivo criado
   - Resumo do que o script testa
   - Como executar
   - Pré-condições ou riscos relevantes

## Convenções do projeto

- SQL Editor do Supabase: rodar blocos separados, não DO blocks com variáveis complexas
- Dados de teste: sempre limpar ao final, ou usar pedidos/clientes reais com reset de flags
- Nomes de colunas: consultar `docs/SCHEMA.md` — armadilhas documentadas lá (ex: `qty` não `quantity`)
- Funções críticas (ex: `create-order`) estão em feature freeze — o script de teste não deve modificá-las
