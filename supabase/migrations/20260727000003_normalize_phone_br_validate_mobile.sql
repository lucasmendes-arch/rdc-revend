-- Endurece normalize_phone_br depois de olhar os dados reais.
--
-- Os telefones de candidates.whatsapp convivem em três formatos:
--   13 dígitos  5527999243617   (com código de país)
--   11 dígitos  27998883912     (DDD + 9 + 8, sem país)
--   11 dígitos  55279998052     ← TRUNCADO: é um 13 dígitos que perdeu 2
--
-- O terceiro caso é o problema. A versão anterior tratava qualquer 11 dígitos
-- como DDD + 9 + 8 e produzia '5579998052' para ele — uma chave bem formada,
-- porém de outro telefone. Mensagem de um número legítimo (55) 7999-8052
-- casaria com o candidato errado. Falhar em casar é aceitável; casar errado
-- não é.
--
-- A trava: num celular brasileiro de 11 dígitos o terceiro dígito é
-- obrigatoriamente o 9 (o "nono dígito", DDD + 9 + 8 dígitos). Nos dois
-- registros truncados ele é 7 e 2 — dá pra rejeitar com certeza. Números de
-- 10 dígitos (fixo ou celular antigo) seguem aceitos sem essa checagem.
--
-- Afetados hoje: 2 candidatos, ambos já em 'contratado' (Cindy Pires Souto,
-- Raquel Cordeiro Santana). Passam a devolver NULL — mensagem vinda deles não
-- vincula a card nenhum e fica na fila de não-casadas, que é o comportamento
-- correto pra dado corrompido. Corrigir o cadastro resolve.

CREATE OR REPLACE FUNCTION normalize_phone_br(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;

  v_digits := regexp_replace(split_part(p_phone, '@', 1), '[^0-9]', '', 'g');

  IF length(v_digits) IN (12, 13) AND left(v_digits, 2) = '55' THEN
    v_digits := substr(v_digits, 3);
  END IF;

  IF length(v_digits) = 11 THEN
    -- Terceiro dígito precisa ser o nono dígito do celular. Se não for, o
    -- número está corrompido (truncado, digitado errado) e qualquer chave
    -- derivada dele apontaria pro telefone de outra pessoa.
    IF substr(v_digits, 3, 1) <> '9' THEN
      RETURN NULL;
    END IF;
    v_digits := left(v_digits, 2) || right(v_digits, 8);
  END IF;

  IF length(v_digits) <> 10 THEN RETURN NULL; END IF;

  RETURN v_digits;
END;
$$;

-- O índice de expressão em candidates referencia esta função; como a
-- assinatura não mudou, ele continua válido. Reindexar mesmo assim porque os
-- valores indexados mudaram para as linhas corrompidas.
REINDEX INDEX idx_candidates_phone_key;
