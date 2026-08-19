-- Estende a whitelist de campos de condição com os do processo de DP.
--
-- evaluate_automation_conditions falha FECHADO em campo desconhecido (retorna
-- false, a condição nunca casa). Sem isto, uma regra de DP com condição do tipo
-- "tipo de vínculo é mei" simplesmente nunca dispararia — e sem erro nenhum,
-- que é o pior jeito de descobrir.
--
-- Mudança puramente aditiva: os 5 campos de candidato continuam idênticos, e a
-- lógica de comparação não muda. Conferido antes de recriar que a versão live
-- é a de 20260719000002, sem edição de outra sessão (ver
-- project_concurrent_sessions na memória operacional).
--
-- process.employment_type e process.stage são texto, comparados como texto —
-- não há campo numérico novo, então o ramo numérico segue exclusivo de
-- candidate.age.

CREATE OR REPLACE FUNCTION evaluate_automation_conditions(p_conditions jsonb, p_context jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cond jsonb;
  v_field text;
  v_op text;
  v_actual text;
  v_expected text;
BEGIN
  IF p_conditions IS NULL OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN true;
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    v_field := v_cond->>'field';
    v_op := v_cond->>'op';

    IF v_field NOT IN (
      'candidate.age', 'candidate.stage', 'job_opening.role_title', 'store.name', 'store.slug',
      'process.employment_type', 'process.stage', 'process.role_title'
    ) THEN
      RETURN false;
    END IF;

    v_actual := CASE v_field
      WHEN 'candidate.age'            THEN p_context->'candidate'->>'age'
      WHEN 'candidate.stage'          THEN p_context->'candidate'->>'stage'
      WHEN 'job_opening.role_title'   THEN p_context->'job_opening'->>'role_title'
      WHEN 'store.name'               THEN p_context->'store'->>'name'
      WHEN 'store.slug'               THEN p_context->'store'->>'slug'
      WHEN 'process.employment_type'  THEN p_context->'process'->>'employment_type'
      WHEN 'process.stage'            THEN p_context->'process'->>'stage'
      WHEN 'process.role_title'       THEN p_context->'process'->>'role_title'
    END;

    IF v_op = 'in' THEN
      IF NOT (v_actual = ANY (SELECT jsonb_array_elements_text(v_cond->'value'))) THEN RETURN false; END IF;
      CONTINUE;
    END IF;

    v_expected := v_cond->>'value';

    IF v_field = 'candidate.age' THEN
      CASE v_op
        WHEN 'eq'  THEN IF NOT (v_actual::numeric = v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'neq' THEN IF NOT (v_actual::numeric != v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'gt'  THEN IF NOT (v_actual::numeric > v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'gte' THEN IF NOT (v_actual::numeric >= v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'lt'  THEN IF NOT (v_actual::numeric < v_expected::numeric) THEN RETURN false; END IF;
        WHEN 'lte' THEN IF NOT (v_actual::numeric <= v_expected::numeric) THEN RETURN false; END IF;
        ELSE RETURN false;
      END CASE;
    ELSE
      CASE v_op
        WHEN 'eq'       THEN IF NOT (v_actual = v_expected) THEN RETURN false; END IF;
        WHEN 'neq'      THEN IF NOT (v_actual IS DISTINCT FROM v_expected) THEN RETURN false; END IF;
        WHEN 'contains' THEN IF NOT (v_actual ILIKE '%' || v_expected || '%') THEN RETURN false; END IF;
        ELSE RETURN false;
      END CASE;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;
