import { describe, expect, it } from 'vitest'

import {
  brNumber, clientKey, decodeReport, detectReport, parseClientes, parseFinanceiro, ReportError,
  stableHash, tokenize,
} from './trinks-reports'

// Fixtures sintéticas no formato real das exportações (08/10/2026): preâmbulo,
// cabeçalho de 28 colunas, comentário com quebra de linha, linha de total e a
// tabela de caixa no fim. Nomes e valores inventados.
const H = '"Data de Atendimento/Venda";"Data de Pagamento/Estorno";"Tipo";"ID Cliente";"Nome do Cliente";"Total (R$) Serviço";"Quantidade Serviço";"Total (R$) Produtos";"Quantidade Produto UN";"Total (R$) Pacotes";"Quantidade Pacotes";"Total (R$) Vale-Presente";"Quantidade Vale-Presente";"Total (R$) Crédito Cliente";"Total (R$) Descontos";"Motivo Desconto";"Total (R$) Crédito";"Total (R$) Débito";"Total (R$) Dinheiro";"Total (R$) Pré-Pago";"Total (R$) Outros";"Total (R$) Troco";"Total (R$) Gorjeta";"Total (R$)";"Quem Fechou a Conta";"Comentário sobre o Fechamento";"Comentário sobre o Estorno";"Nº Fechamento"'

const tx = (paid: string, client: string, serv: string, prod: string, desc: string, total: string, comment = '') =>
  `"${paid.slice(0, 10)}";"${paid}";"Pagamento";"${client}";"Cliente ${client}";"${serv}";"1";"${prod}";"1";"0,00";"0";"0,00";"0";"0,00";"${desc}";"${desc === '0,00' ? '' : 'Promoção da semana/mês'}";"0,00";"0,00";"0,00";"0,00";"${total}";"0,00";"0,00";"${total}";"Recepção";"${comment}";"";""`

function financeiro(lines: string[], total: string, opts: { tipoData?: string } = {}) {
  return [
    '""',
    `"${opts.tipoData ?? 'Data de Pagamento/Estorno'}"`,
    '"Data Início: 01/10/2026"',
    '"Data Fim: 08/10/2026"',
    '"Relatório gerado em 08/10/2026 às 22:44"',
    '""',
    H,
    ...lines,
    `"";"";"";"Total (R$):";"0,00";"0";"0,00";"0";"0,00";"0";"0,00";"0";"0,00";"0,00";"";"0,00";"0,00";"0,00";"0,00";"0,00";"0,00";"0,00";"${total}"`,
    '""',
    '"Data";"Abertura do Caixa";"Sangria";"Historico de abertura de caixa"',
    '"07/10/2026";"52,98";"600,00";"Registrado por Recepção em 07/10/2026 19:19:04"',
    '"";"Total período";"102.004,65";""',
  ].join('\r\n')
}

describe('helpers', () => {
  it('brNumber lida com milhar, vírgula, negativo e vazio', () => {
    expect(brNumber('1.234,56')).toBe(1234.56)
    expect(brNumber('-34.171,32')).toBe(-34171.32)
    expect(brNumber('')).toBe(0)
    expect(() => brNumber('abc')).toThrow()
  })

  it('tokenize respeita quebra de linha dentro de aspas e aspas escapadas', () => {
    expect(tokenize('"a";"linha1\nlinha2";"x""y"\n"b"')).toEqual([['a', 'linha1\nlinha2', 'x"y'], ['b']])
  })

  it('tokenize tolera aspa não escapada no meio do campo (bug da exportação do Trinks)', () => {
    expect(tokenize('"";"Balcão";"Maria "Mel" Souza";"x"\n"";"Web";"Ana";"y"')).toEqual([
      ['', 'Balcão', 'Maria "Mel" Souza', 'x'],
      ['', 'Web', 'Ana', 'y'],
    ])
  })

  it('decodeReport cai para Windows-1252 quando não é UTF-8', () => {
    const latin1 = new Uint8Array([0x53, 0x65, 0x72, 0x76, 0x69, 0xe7, 0x6f]) // "Serviço" em 1252
    expect(decodeReport(latin1)).toBe('Serviço')
  })

  it('stableHash é determinístico', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'))
    expect(stableHash('abc')).not.toBe(stableHash('abd'))
  })
})

describe('parseFinanceiro', () => {
  const lines = [
    tx('01/10/2026 10:29', '101', '200,00', '0,00', '0,00', '200,00'),
    tx('01/10/2026 11:23', '102', '0,00', '120,00', '-20,00', '100,00', 'pix cnpj\nretirar do caixa'),
    tx('02/10/2026 09:00', '103', '150,00', '0,00', '0,00', '150,00'),
  ]

  it('lê fechamentos, ignora total e tabela de caixa, confere a soma', () => {
    const r = parseFinanceiro(financeiro(lines, '450,00'))
    expect(r.period_start).toBe('2026-10-01')
    expect(r.period_end).toBe('2026-10-08')
    expect(r.generated_at).toBe('2026-10-08T22:44:00-03:00')
    expect(r.rows).toHaveLength(3)
    expect(r.file_total).toBe(450)

    const second = r.rows[1]
    expect(second.business_date).toBe('2026-10-01')
    expect(second.paid_at).toBe('2026-10-01T11:23:00')
    expect(second.discounts).toBe(20)              // módulo
    expect(second.pay_other).toBe(100)
    expect(second.comment).toBe('pix cnpj\nretirar do caixa')
    expect(second.trinks_client_id).toBe(102)
  })

  it('detecta o tipo do relatório', () => {
    expect(detectReport(financeiro(lines, '450,00'))).toBe('financeiro')
  })

  it('recusa quando a soma não bate com o total impresso', () => {
    expect(() => parseFinanceiro(financeiro(lines, '999,00'))).toThrow(ReportError)
  })

  it('recusa exportação filtrada por data de atendimento', () => {
    expect(() => parseFinanceiro(financeiro(lines, '450,00', { tipoData: 'Data de Atendimento/Venda' })))
      .toThrow(/Data de Pagamento/)
  })

  it('recusa fechamento fora do período declarado', () => {
    const fora = [tx('15/10/2026 10:00', '1', '10,00', '0,00', '0,00', '10,00')]
    expect(() => parseFinanceiro(financeiro(fora, '10,00'))).toThrow(/fora do periodo/)
  })

  it('linhas idênticas viram chaves distintas (#1, #2) e reexportação gera as mesmas chaves', () => {
    const dup = tx('03/10/2026 10:00', '7', '50,00', '0,00', '0,00', '50,00')
    const a = parseFinanceiro(financeiro([dup, dup], '100,00'))
    expect(a.rows.map(x => x.source_key.split('#')[1])).toEqual(['1', '2'])
    const b = parseFinanceiro(financeiro([dup, dup], '100,00'))
    expect(b.rows.map(x => x.source_key)).toEqual(a.rows.map(x => x.source_key))
  })

  it('editar comentário ou quem fechou NÃO muda a chave (evita duplicar)', () => {
    const base = tx('03/10/2026 10:00', '7', '50,00', '0,00', '0,00', '50,00')
    const edited = base.replace('"Recepção";""', '"Outra pessoa";"comentario novo"')
    expect(parseFinanceiro(financeiro([base], '50,00')).rows[0].source_key)
      .toBe(parseFinanceiro(financeiro([edited], '50,00')).rows[0].source_key)
  })
})

describe('parseClientes', () => {
  const CH = '"CPF";"Origem";"Nome";"Gênero";"Telefone 1";"Telefone 2";"E-mail";"Data de Nascimento";"Data de Cadastro";"Observações";"Pode agendar online";"Primeiro agendamento";"Último agendamento";"Status do primeiro agendamento";"Status do último agendamento";"Recebe SMS";"Recebe e-mails agendamentos";"Recebe e-mail sobre Programa de Fidelidade";"CEP";"Estado";"Endereço";"Número";"Complemento";"Bairro";"Cidade";"Como nos conheceu";"Etiquetas";"Instagram"'
  const cli = (cpf: string, nome: string, tel: string, cad: string, tags = '') =>
    `"${cpf}";"Balcão";"${nome}";"Feminino";"${tel}";"";"";"24/08/1997";"${cad}";"";"Sim";"13/09/2025";"20/05/2026";"Finalizado";"Cliente não compareceu";"Sim";"Sim";"Não";"";"";"";"";"";"";"";"Instagram";"${tags}";""`
  const file = (lines: string[]) => [
    '"Nome:"', '"Clientes que podem agendar online: Todos"', '"Listar clientes ativos"',
    '"Relatório gerado em 08/10/2026 às 22:31"', '', CH, ...lines,
  ].join('\r\n')

  it('lê clientes, etiquetas, datas e opt-ins', () => {
    const r = parseClientes(file([
      cli('', 'Ana Souza', '(27) 99999-0001', '11/09/2025', 'Pref. CINDY / Cliente Faltoso'),
      cli('123.456.789-09', 'Bia Lima', '(27) 99999-0002', '10/02/2026'),
    ]))
    expect(r.only_active).toBe(true)
    expect(r.rows).toHaveLength(2)
    const ana = r.rows[0]
    expect(ana.client_key).toBe('np:ana souza|27999990001')
    expect(ana.tags).toEqual(['Pref. CINDY', 'Cliente Faltoso'])
    expect(ana.registered_on).toBe('2025-09-11')
    expect(ana.last_appointment_status).toBe('Cliente não compareceu')
    expect(ana.accepts_loyalty_email).toBe(false)
    expect(ana.acquisition_channel).toBe('Instagram')
    expect(r.rows[1].client_key).toBe('cpf:12345678909')
    expect(detectReport(file([]))).toBe('clientes')
  })

  it('mesmo nome e telefone = mesma pessoa; fica o cadastro mais antigo', () => {
    const r = parseClientes(file([
      cli('', 'Ana Souza', '27999990001', '10/02/2026'),
      cli('', 'ANA  SOUZA', '(27) 99999-0001', '11/09/2025'),
    ]))
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].registered_on).toBe('2025-09-11')
  })

  it('mesmo telefone com nomes diferentes = pessoas diferentes (família)', () => {
    expect(clientKey('Mãe', '', '27999990001')).not.toBe(clientKey('Filha', '', '27999990001'))
  })
})
