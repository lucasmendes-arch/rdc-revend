import { Navigate } from 'react-router-dom'

/**
 * `/portal/comprar` nunca foi terminada: renderizava a saudação do parceiro e
 * mais nada abaixo dela — uma tela em branco com cabeçalho. Também não está
 * linkada em nenhum ponto da navegação, nem na sidebar, nem no dashboard.
 *
 * A superfície real de compra é `/catalogo`. Enquanto a rota existir, ela
 * aponta para lá em vez de entregar uma página vazia.
 *
 * TODO: remover a rota de App.tsx e apagar este arquivo — decisão do produto,
 * não do design.
 */
export default function PortalComprar() {
  return <Navigate to="/catalogo" replace />
}
