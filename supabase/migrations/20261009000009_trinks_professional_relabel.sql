-- ============================================================================
-- Nome do profissional chega depois → renomeia o passado
--
-- Os webhooks de fechamento (1) e agendamento (11/12) só trazem o ID do
-- profissional. O nome vem dos eventos 5/6 (cadastro/edição), que só disparam
-- quando alguém salva o profissional no Trinks. Até lá, trinks_professional_name
-- devolve "Profissional #<id>" e esse texto fica gravado nos itens e
-- agendamentos — e, por consequência, nos resumos (trinks_professional_sales).
--
-- Antes, o nome que chegava depois só valia para eventos novos: os dias já
-- gravados continuavam com o código. Este trigger corrige para trás:
-- ao inserir/atualizar o nome em trinks_professionals, troca o texto
-- provisório pelo nome (mesma regra: apelido, senão nome — é o que o CSV usa)
-- e recalcula os resumos SÓ dos dias afetados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trinks_professional_relabel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name     text := coalesce(nullif(NEW.nickname, ''), NEW.name);
  v_old      text;
  v_from     date;
  v_to       date;
BEGIN
  -- Rótulos que podem estar gravados: o provisório e, numa edição, o nome antigo.
  v_old := 'Profissional #' || NEW.trinks_professional_id;

  -- Itens de venda (alimentam produção por profissional e rankings).
  WITH upd AS (
    UPDATE trinks_sale_items
       SET professional = v_name
     WHERE store_id = NEW.store_id
       AND trinks_professional_id = NEW.trinks_professional_id
       AND professional IS DISTINCT FROM v_name
    RETURNING business_date
  )
  SELECT min(business_date), max(business_date) INTO v_from, v_to FROM upd;

  IF v_from IS NOT NULL THEN
    PERFORM trinks_rebuild_sales(NEW.store_id, v_from, v_to);
  END IF;

  -- Agendamentos.
  WITH upd AS (
    UPDATE trinks_appointments
       SET professional = v_name
     WHERE store_id = NEW.store_id
       AND trinks_professional_id = NEW.trinks_professional_id
       AND professional IS DISTINCT FROM v_name
    RETURNING appointment_date
  )
  SELECT min(appointment_date), max(appointment_date) INTO v_from, v_to FROM upd;

  IF v_from IS NOT NULL THEN
    PERFORM trinks_rebuild_appointments(NEW.store_id, v_from, v_to);
  END IF;

  -- Assistente não tem coluna de ID: troca só o rótulo provisório exato.
  UPDATE trinks_sale_items
     SET assistant = v_name
   WHERE store_id = NEW.store_id AND assistant = v_old;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trinks_professional_relabel ON public.trinks_professionals;
CREATE TRIGGER trg_trinks_professional_relabel
  AFTER INSERT OR UPDATE OF name, nickname ON public.trinks_professionals
  FOR EACH ROW EXECUTE FUNCTION public.trinks_professional_relabel();

-- Aplica aos profissionais que já chegaram antes deste trigger existir.
UPDATE public.trinks_professionals SET name = name;
