import { describe, it, expect } from 'vitest'
import { toCsv, slugifyForFilename } from './csv'

describe('toCsv', () => {
  it('separa por ponto e vírgula e quebra linha com CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a;b\r\nc;d')
  })

  it('mantém número cru pra planilha somar, inclusive negativo', () => {
    expect(toCsv([[48, -12, 0]])).toBe('48;-12;0')
  })

  it('trata null/undefined como célula vazia', () => {
    expect(toCsv([[null, undefined, 'x']])).toBe(';;x')
  })

  it('protege separador, aspa e quebra de linha dentro do texto', () => {
    expect(toCsv([['Shampoo 300ml; refil']])).toBe('"Shampoo 300ml; refil"')
    expect(toCsv([['Máscara 5"']])).toBe('"Máscara 5"""')
    expect(toCsv([['linha1\nlinha2']])).toBe('"linha1\nlinha2"')
  })

  it('neutraliza fórmula em célula de texto (CSV injection)', () => {
    expect(toCsv([['=SOMA(A1:A9)']])).toBe("'=SOMA(A1:A9)")
    expect(toCsv([['@import']])).toBe("'@import")
    // '-12' como TEXTO ganha o prefixo; como número, não — senão o Excel
    // deixaria de somar a coluna Diferença.
    expect(toCsv([['-12']])).toBe("'-12")
    expect(toCsv([[-12]])).toBe('-12')
  })
})

describe('slugifyForFilename', () => {
  it('tira acento, espaço e pontuação', () => {
    expect(slugifyForFilename('Todas as lojas (consolidado)')).toBe('todas-as-lojas-consolidado')
    expect(slugifyForFilename('São Gabriel')).toBe('sao-gabriel')
  })
})
