# Inventário funcional — Catálogo e Checkout

> Data: 2026-07-07
> Escopo: `src/pages/Catalogo.tsx` (1.479 linhas) e `src/pages/Checkout.tsx` (1.132 linhas).
> Propósito: reconhecimento funcional antes de decidir escopo de simplificação. **Nenhuma linha foi alterada.**
> Convenção: itens marcados como *(verificar)* são inferência de leitura de código, não fato confirmado em produção.

---

## 1. Catálogo (`src/pages/Catalogo.tsx`)

### 1.1 Inventário de funcionalidades

**Vitrine e navegação**
- Exibe o catálogo B2B em dois modos: navegação (carrosséis horizontais por categoria) e lista plana (durante busca ou no modo "ver todos", ativado pela URL `?view=todos`)
- Hero de apresentação B2B com botões que rolam a página até os kits ou até os produtos
- Seção "Seleção dos Mais Vendidos" com cards de kits/pacotes prontos (ocultos para parceiros de rede)
- Seção "Como funciona" e chamada para WhatsApp no fim da página
- Banner rotativo de confiança (fórmula limpa, envio rápido, compra segura etc.) que troca sozinho a cada 4,5s
- Bolhas de categoria fixas no topo (mobile) para pular/filtrar por categoria

**Busca, filtros e ordenação**
- Busca por nome com atraso de 300ms para não filtrar a cada tecla
- Filtros: faixa de preço (mín/máx), múltiplas categorias, "uso profissional", "somente com preço sugerido"
- Ordenação: padrão (ordem manual do admin), nome A-Z/Z-A, menor/maior custo e **maior lucro** (calculado pela margem entre custo e preço de revenda sugerido)
- Chips removíveis mostrando os filtros ativos + botão "limpar tudo"; contador de filtros ativos nos ícones
- Sidebar de filtros no desktop (seções recolhíveis) e drawer de filtros no mobile
- Esconde categorias sem produtos no resultado atual da busca

**Preços e perfis de usuário**
- Visitante não logado: preços ocultos ("ver preço ao cadastrar"), botões viram convite para `/cadastro`
- Cliente logado: vê preço de custo e preço de revenda sugerido (o sugerido vem do banco; se não cadastrado, usa 2x o custo como fallback — há um TODO no código para remover isso quando o banco estiver populado)
- Parceiro (`is_partner`): vê `partner_price`, e se tiver tabela de preços vinculada, os preços da tabela sobrepõem o partner_price; se a tabela falhar ao carregar, mostra aviso de que os preços podem não refletir a tabela personalizada
- Produtos "uso profissional" não exibem preço de revenda sugerido

**Carrinho**
- Adiciona ao carrinho com quantidade escolhida; atalhos +6/+12/+24 (lotes); stepper de quantidade
- Feedback visual ao adicionar (botão fica verde, ícone do carrinho "pula", toast com atalho "ver pedido")
- Abre o drawer lateral do carrinho (componente compartilhado `CartDrawer`)
- Visitante que tenta adicionar recebe toast com convite para criar conta

**Modal de produto**
- Detalhe do produto com imagem, preços, descrição (HTML da Nuvemshop limpo de wrappers `{pt:...}` e sanitizado com DOMPurify), quantidade e botão de adicionar

**Outros**
- Popup de completar cadastro ("progressive profiling"): para cliente logado com perfil incompleto, aparece após 15s, no máximo 2 vezes por usuário (controle via localStorage), não reaparece se dispensado na sessão
- Rastreia eventos de funil: visita à página, visualização de produto e adição ao carrinho (CRM + pixel do Facebook)
- Header próprio com login/logout, atalhos para painel admin (se admin) e área do salão (se salao)
- **Modo portal** (`portalMode`): a mesma tela é reaproveitada dentro do Portal do Parceiro com header/hero/kits/sidebar ocultos e carrossel único com chips de categoria

### 1.2 Dependências externas

| Dependência | Uso | Freeze/contrato? |
|---|---|---|
| Tabela `catalog_products` | listagem de produtos ativos (via hook `useCatalogProducts`) | — |
| Tabela `categories` | categorias e ordem (via `useCategories`) | — |
| RPC `get_my_price_list_items` | preços da tabela do parceiro logado | assinatura documentada no SCHEMA.md |
| Tabela `profiles` | leitura para decidir se mostra popup de perfil; o popup (`ProfileCompletionModal`) grava no perfil | — |
| Tabelas `client_sessions` + `crm_events` | tracking de funil (via `useSessionTracking`/`crmService`) | `client_sessions` tem armadilha documentada: `ON CONFLICT (user_id)` |
| Tabela `store_settings` | valor mínimo de pedido (indireto, via `CartContext`) | — |
| Facebook Pixel (`window.fbq`) | eventos AddToCart (disparado também dentro do `CartContext`) | — |
| Supabase Auth | logout | — |
| Imagens | `main_image` dos produtos (pipeline WebP → R2; produtos sincronizados podem apontar pro CDN da Nuvemshop) | — |

Não chama nenhuma edge function diretamente. Não toca em área de feature freeze.

### 1.3 Exclusivo da tela vs. compartilhado

**Só o Catálogo usa** (deletar junto não quebra mais nada):
- Componentes `PackageCards`, `CategoryBubbles`, `CompactProductCarousel`, `B2BHero`, `HowItWorks`, `WhatsAppCTA` (pasta `components/catalog/`), `ProfileCompletionModal`, e os componentes internos do arquivo (`RotatingTrustBanner`, `FilterChip`)
- `src/config/packages.ts` (definição dos kits, usado só pelo `PackageCards`)

**Compartilhado** (mexer aqui afeta outras telas):
- `CartContext`/`useCart` — usado também por Checkout, `CartDrawer`, `PortalLayout`, `PackageCards`, `WhatsAppButton` (landing)
- `CartDrawer` — também renderizado pelo `PortalLayout`
- `useCatalogProducts` — também usado pela `Lookbook`; o tipo `PublicProduct` é importado por `admin/NewOrder` e `config/packages.ts`
- `useCategories` — também usado por `admin/Categorias` e `admin/Catalogo`
- `useSessionTracking` — compartilhado com Checkout (e `crmService` com `Cadastro` e `admin/CrmDebug`)
- `utils/product` (`extractVolume`) — usado também pelo `CompactProductCarousel`
- `utils/profile` — usado também pelo `ProfileCompletionModal`
- **A própria tela é compartilhada**: `PortalComprar` renderiza `<Catalogo portalMode />`. Qualquer mudança no Catálogo público afeta o Portal do Parceiro.

### 1.4 Sinais de uso real / possível obsolescência

- **TODO explícito** no fallback de preço sugerido ("remover quando todos os produtos tiverem compare_at_price no banco") — sinal de migração de dados inacabada
- `clearCart` e `removeItem` são obtidos do carrinho mas **nunca usados na tela** (o drawer cuida disso) — resíduo
- O tipo `Category` é importado mas não referenciado diretamente
- A lógica de derivar categorias a partir dos produtos ("to handle anonymous RLS") é um fallback para visitante anônimo — funcional, mas duplica a fonte de categorias
- Filtro "Preço sugerido" (`filterOnlySuggested`) só aparece para logados e filtra por `compare_at_price` preenchido — utilidade cai a zero quando o TODO acima for resolvido
- Comentário "Trust Banner (Removed as it is now in the sticky header)" — camada de layout que já mudou de lugar pelo menos uma vez

### 1.5 Acoplamento com o fluxo catálogo → checkout → pedido

- **O carrinho é o único canal entre as telas.** Vive no `CartContext`, persistido em `localStorage` (`rdc-cart-v1`), com item no formato `{id, name, price, image, quantity}`. É zerado quando troca o usuário logado.
- **O preço gravado no carrinho é o preço "de exibição"** do momento da adição (já com preço de parceiro ou de tabela aplicado). O servidor **ignora** esse preço — ver 2.5.
- Caminhos de entrada no Checkout: botão "Finalizar Pedido" do `CartDrawer`, ação do toast em `PackageCards` e botão do `PortalComprar`. Todos só fazem `navigate('/checkout')` — nada é passado por parâmetro; tudo vem do contexto.
- O valor mínimo de pedido (`store_settings.min_cart_value`, default R$ 500) é lido uma vez no `CartContext` e usado tanto no drawer quanto na validação do Checkout.

---

## 2. Checkout (`src/pages/Checkout.tsx`)

### 2.1 Inventário de funcionalidades

Fluxo em **4 passos** com indicador visual (Resumo → Oferta → Entrega → Pagamento):

**Passo 1 — Resumo**
- Lista os itens do carrinho com subtotal; bloqueia avanço se o total estiver abaixo do pedido mínimo (mostra quanto falta)
- Redireciona de volta ao catálogo se o carrinho esvaziar

**Passo 2 — Oferta (upsell)**
- Mostra **uma** oferta especial ativa (produto com desconto, badge de % off, quantidade fixa) com "sim, adicionar" ou "não, obrigado"
- O passo é pulado automaticamente se: não há oferta ativa, o produto da oferta já está no carrinho, ou o cliente já respondeu

**Passo 3 — Entrega**
- Pré-preenche nome, WhatsApp, e-mail, documento e endereço a partir do perfil; mostra como resumo somente-leitura e **só pede os campos que faltam** (com botão "editar dados" para reabrir tudo)
- Escolha de entrega: **receber em casa** (formulário de endereço completo) ou **retirar na loja** (grátis; 3 unidades fixas na tela: Linhares, Serra e Teixeira de Freitas, com endereços escritos à mão no código)
- Campo de observações livres
- **Cupom de desconto**: valida no servidor; suporta 4 tipos — valor fixo, percentual, frete grátis e percentual de desconto no frete (oculto para parceiro de rede)
- **Frete**: estimativa fixa de **20% do subtotal** (não há cálculo por CEP — o CEP é só endereço); zero para retirada; zero para parceiro de rede ("transporte próprio da rede"); rótulo diz que é "média de cotação com transportadoras parceiras"
- Resumo do total (subtotal + frete − descontos)
- Validações locais: campos obrigatórios, CPF/CNPJ válido (dígito verificador via utilitário), WhatsApp com 11+ dígitos, UF com 2 letras, unidade de retirada selecionada

**Passo 4 — Pagamento**
- Formas: PIX, cartão de crédito e — só para parceiro de rede — "pagar na entrega" (que já vem pré-selecionado para esse segmento)
- Ao finalizar: renova a sessão de autenticação, salva de volta no perfil os dados/endereço digitados (sem aguardar resposta), monta as observações finais com endereço e forma de pagamento em texto, e chama a edge function `create-order`
- Se a resposta trouxer `payment_url`, redireciona para o gateway (MercadoPago); senão vai para a página de sucesso `/pedido/sucesso/:id`
- Limpa o carrinho após criar o pedido; o status "comprou" do funil é responsabilidade do webhook de pagamento, não desta tela

**Transversal**
- Rastreia "iniciou checkout" no CRM e no pixel do Facebook

### 2.2 Dependências externas

| Dependência | Uso | Freeze/contrato? |
|---|---|---|
| **Edge function `create-order`** | criação do pedido (único ponto do sistema) | **FEATURE FREEZE PERMANENTE** — contrato fixo em `docs/create-order-contract.md`; qualquer mudança de payload passa por aprovação + checklist |
| RPC `validate_coupon` | validação de cupom | contrato documentado (retorna `{valid, id, type, value}` — armadilha de nomenclatura conhecida) |
| Tabela `profiles` | pré-preenchimento + gravação de volta dos dados/endereço + leitura de `customer_segment` | — |
| Tabela `upsell_offers` | oferta ativa (via `useActiveUpsell`) | — |
| Tabela `store_settings` | pedido mínimo (indireto, via `CartContext`) | — |
| Tabelas `client_sessions` + `crm_events` | tracking "iniciou_checkout" | — |
| MercadoPago | destino do redirect `payment_url` (a integração em si vive na edge function) | dentro do freeze do create-order |
| Facebook Pixel | evento InitiateCheckout | — |
| Supabase Auth | `refreshSession()` antes de chamar a edge function | — |

### 2.3 Exclusivo da tela vs. compartilhado

**Só o Checkout usa**:
- Todo o fluxo de passos é interno ao arquivo (não há componentes extraídos)
- `utils/validateDocument` (`isValidDocument`) — nenhum outro import no `src/`
- `hooks/useUpsell` (`useActiveUpsell`) — nenhum outro import no `src/`

**Compartilhado**:
- `CartContext`/`useCart` (mesma lista da seção 1.3)
- `useSessionTracking` (com Catálogo)
- `AuthContext`, client Supabase
- A rota `/checkout` é referenciada por `CartDrawer`, `PackageCards`, `PortalComprar`, `PixelTracker` e `WhatsAppButton` (estes dois últimos só olham o pathname para se comportar diferente)

### 2.4 Sinais de uso real / possível obsolescência

- **Comentário desatualizado**: "If AbacatePay returned a payment URL" — o gateway real é MercadoPago; resquício de uma integração anterior ou planejada
- **Parcelamento morto**: o seletor de parcelas foi removido da UI ("Installment selection removed as per user request"), mas o estado `installments` continua existindo e é sempre 1; o texto de pagamento ainda gera "(Nx com/sem juros)" que nunca varia
- **Tracking duplicado de "iniciou checkout"**: dois `useEffect` disparam o mesmo evento — um roda a cada mudança de total/quantidade, outro só na montagem. Na prática o evento é reenviado várias vezes por visita *(o upsert no CRM absorve, mas o pixel recebe repetido)*
- **Unidades de retirada hardcoded e defasadas**: a tela oferece 3 unidades escritas no código, enquanto o banco (`pickup_units`/`stores`) tem 5 lojas (faltam Colatina e São Gabriel da Palha). A tradução slug→nome no texto de observações também só conhece as 3 *(verificar se a limitação a 3 é intencional — ex.: só essas unidades aceitam retirada)*
- **Validação de documento inconsistente entre passos**: o passo 3 usa a validação completa com dígito verificador; o `handleSubmit` refaz só uma checagem de tamanho (11/14 dígitos)
- O endereço/pagamento vai **em texto livre dentro de `notes`** — o pedido tem colunas estruturadas para parte disso; as observações são a única fonte do endereço de entrega *(verificar como o admin consome isso hoje)*
- No hook compartilhado de tracking há um `useTrackPurchase` marcado `@deprecated` ("nunca foi chamado; confirmação real vem do webhook") — não é desta tela, mas é vizinho direto do fluxo

### 2.5 Acoplamento com o fluxo catálogo → checkout → pedido

- **O que o Checkout espera receber do Catálogo**: apenas o `CartContext` populado (itens com `{id, name, price, image, quantity}`) e o `minOrderValue` já carregado. Nada vem por URL, state de navegação ou props. Carrinho vazio → volta pro catálogo.
- **O que o Checkout envia pro backend**: só `product_id` + `qty` de cada item (mais dados do cliente, entrega, cupom e frete *sugerido*). O contrato do `create-order` é explícito: **preços, estoque, subtotal mínimo e desconto de cupom são recalculados no servidor** — o preço que o Catálogo colocou no carrinho é apenas exibição.
- **Consequência prática do ponto acima** *(verificar)*: o desconto do **upsell** existe só no preço do item dentro do carrinho (lado cliente). Como o servidor recalcula pelo preço de tabela do `catalog_products` e o contrato não menciona upsell, o total exibido no resumo pode divergir do total efetivamente cobrado quando há upsell aceito. Vale confirmar num pedido real antes de mexer nessa área.
- **Depois do pedido**: `clearCart()` + redirect (gateway ou `/pedido/sucesso/:id`). A transição do funil para "comprou" e a baixa de estoque acontecem server-side (edge function + webhook MercadoPago) — a tela de sucesso e o kanban de pedidos do admin consomem o que o `create-order` gravou.
- **Pontos de fricção para simplificação**: qualquer mudança no formato dos itens do carrinho afeta as duas telas + `CartDrawer` + `PackageCards` + o payload do `create-order` (congelado). O caminho seguro é mudar apresentação sem tocar no shape `{id, name, price, image, quantity}` nem no payload da edge function.

---

## Resumo executivo para decisão de escopo

1. **Catálogo** é grande porque acumula 3 telas em 1: vitrine pública, modo portal e grid de busca — com muita marcação visual repetida (o mesmo card de produto existe em 2 variantes no arquivo + 1 no `CompactProductCarousel`). A lógica de negócio real (filtros, preços por perfil, carrinho) é pequena em comparação.
2. **Checkout** é um wizard autocontido; o risco não está no tamanho, mas nas pontas: contrato congelado do `create-order`, cupom com 4 tipos, e os sinais da seção 2.4 (unidades hardcoded, upsell possivelmente cosmético, tracking duplicado) que merecem decisão de produto antes de qualquer refatoração.
3. **O que quebra o quê**: deletar partes visuais do Catálogo é seguro (componentes exclusivos); tocar em `CartContext`, `CartDrawer` ou no shape do carrinho afeta 6+ pontos; tocar no payload do pedido exige o checklist do freeze.
