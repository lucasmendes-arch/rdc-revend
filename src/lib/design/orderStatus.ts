/**
 * Fonte única de verdade para a aparência dos status de pedido.
 *
 * Antes desta tabela, `statusConfig` estava duplicado em 7 arquivos e o MESMO
 * status tinha cores diferentes dependendo da tela: `separacao` era amarelo em
 * /meus-pedidos e roxo em /admin/pedidos; `enviado` era roxo em um e azul-céu
 * em outro. Além de inconsistente, o funil inteiro era colorido — oito etapas,
 * oito cores — o que anula a hierarquia: quando tudo grita, nada é urgente.
 *
 * Regra do sistema: a cor comunica O QUE FAZER, não em que etapa está.
 *
 *   warning  → alguém precisa agir agora (cliente não pagou)
 *   danger   → deu errado / encerrado sem sucesso
 *   success  → deu certo (dinheiro entrou, produto chegou)
 *   info     → em movimento, sem ação pendente
 *   neutral  → em progresso interno ou arquivado
 *
 * O nome da etapa fica no rótulo. Para diferenciar visualmente etapas dentro da
 * mesma família, use o rótulo e a ordem — não invente uma nona cor.
 */

import type { BadgeProps } from "@/components/ui/badge";

export type StatusTone = NonNullable<BadgeProps["variant"]>;

export type OrderStatus =
  | "recebido"
  | "aguardando_pagamento"
  | "pago"
  | "separacao"
  | "enviado"
  | "entregue"
  | "concluido"
  | "cancelado"
  | "expirado";

export interface OrderStatusMeta {
  /** Rótulo completo — usar por padrão. */
  label: string;
  /** Rótulo curto para célula estreita de tabela / card mobile. */
  short: string;
  tone: StatusTone;
  /** Pedido ainda em andamento (não terminal). */
  active: boolean;
}

export const ORDER_STATUS: Record<OrderStatus, OrderStatusMeta> = {
  recebido:             { label: "Recebido",              short: "Recebido",  tone: "info",    active: true },
  aguardando_pagamento: { label: "Aguardando pagamento",  short: "Aguard.",   tone: "warning", active: true },
  pago:                 { label: "Pago",                  short: "Pago",      tone: "success", active: true },
  separacao:            { label: "Em separação",          short: "Separação", tone: "neutral", active: true },
  enviado:              { label: "Enviado",               short: "Enviado",   tone: "info",    active: true },
  entregue:             { label: "Entregue",              short: "Entregue",  tone: "success", active: true },
  concluido:            { label: "Concluído",             short: "Concluído", tone: "neutral", active: false },
  cancelado:            { label: "Cancelado",             short: "Cancelado", tone: "danger",  active: false },
  expirado:             { label: "Expirado",              short: "Expirado",  tone: "neutral", active: false },
};

/** Ordem canônica do funil — usar em filtros e selects para não divergir. */
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "recebido",
  "aguardando_pagamento",
  "pago",
  "separacao",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
  "expirado",
];

/** Status que contam como "pedido em aberto". */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ORDER_STATUS_SEQUENCE.filter(
  (s) => ORDER_STATUS[s].active,
);

const FALLBACK: OrderStatusMeta = {
  label: "Desconhecido",
  short: "—",
  tone: "neutral",
  active: false,
};

/**
 * Resolve um status vindo do banco. Nunca lança: status novo criado no backend
 * antes de chegar aqui degrada para neutro com o próprio código como rótulo,
 * em vez de sumir da tela.
 */
export function getOrderStatus(status: string | null | undefined): OrderStatusMeta {
  if (!status) return FALLBACK;
  return ORDER_STATUS[status as OrderStatus] ?? { ...FALLBACK, label: status, short: status };
}
