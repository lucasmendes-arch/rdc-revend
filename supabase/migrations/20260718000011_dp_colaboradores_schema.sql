-- Módulo Departamento Pessoal (DP) — Etapa 1: schema
-- Assume o candidato a partir do momento em que é contratado no RH (stage='contratado').
-- Fluxo de estágios (estagio_atual) difere por tipo_vinculo (CLT, MEI sem/com experiência).
-- RLS reaproveita has_rh_access() (criada em 20260717000001_rh_recruitment_module.sql).

-- ============================================================
-- Tabelas
-- ============================================================

CREATE TABLE colaboradores_processo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  tipo_vinculo text NOT NULL CHECK (tipo_vinculo IN ('clt', 'mei_sem_experiencia', 'mei_com_experiencia')),
  unidade_id uuid NOT NULL REFERENCES stores(id),
  cargo text NOT NULL,
  estagio_atual text NOT NULL,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'ativo', 'encerrado')),
  data_inicio_processo timestamptz NOT NULL DEFAULT now(),
  data_efetivacao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT colaboradores_processo_estagio_valido CHECK (
    (tipo_vinculo = 'clt' AND estagio_atual IN (
      'documentos', 'exame_admissional', 'onboarding', 'treinamento',
      'experiencia', 'decisao', 'efetivado', 'encerrado'
    ))
    OR (tipo_vinculo = 'mei_sem_experiencia' AND estagio_atual IN (
      'contrato_formacao', 'formacao', 'decisao_formacao', 'documentos',
      'contrato_assinado', 'onboarding', 'treinamento', 'acompanhamento_90d',
      'efetivado', 'encerrado'
    ))
    OR (tipo_vinculo = 'mei_com_experiencia' AND estagio_atual IN (
      'documentos', 'contrato_assinado', 'onboarding', 'treinamento',
      'efetivado', 'encerrado'
    ))
  )
);

CREATE INDEX idx_colaboradores_processo_candidato_id ON colaboradores_processo(candidato_id);
CREATE INDEX idx_colaboradores_processo_unidade_id ON colaboradores_processo(unidade_id);
CREATE INDEX idx_colaboradores_processo_tipo_estagio ON colaboradores_processo(tipo_vinculo, estagio_atual);

-- Um candidato não pode ter dois processos simultaneamente em andamento/ativos —
-- só permite recriar (rehire) se o processo anterior já estiver encerrado.
CREATE UNIQUE INDEX idx_colaboradores_processo_candidato_ativo_unique
  ON colaboradores_processo(candidato_id)
  WHERE status IN ('em_andamento', 'ativo');

CREATE TABLE colaboradores_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES colaboradores_processo(id) ON DELETE CASCADE,
  -- Checklist fixa por tipo_vinculo, definida em código (src/lib/dpConstants.ts) e
  -- populada pela RPC promote_candidate_to_dp — não configurável nesta etapa.
  tipo_documento text NOT NULL CHECK (tipo_documento IN (
    'rg_cpf', 'comprovante_residencia', 'ctps', 'pis_pasep', 'titulo_eleitor',
    'comprovante_escolaridade', 'foto_3x4', 'aso_admissional', 'dados_bancarios',
    'cnpj_ccmei'
  )),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'aprovado')),
  arquivo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_colaboradores_documentos_processo_id ON colaboradores_documentos(processo_id);

CREATE TABLE colaboradores_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES colaboradores_processo(id) ON DELETE CASCADE,
  tipo_contrato text NOT NULL CHECK (tipo_contrato IN ('formacao', 'prestacao_servico', 'clt')),
  arquivo_url text,
  data_assinatura date,
  vigencia_inicio date,
  vigencia_fim date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_colaboradores_contratos_processo_id ON colaboradores_contratos(processo_id);

CREATE TABLE colaboradores_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES colaboradores_processo(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data timestamptz NOT NULL DEFAULT now(),
  texto text NOT NULL,
  -- 'rh': herdado do histórico de recrutamento (copiado 1x na promoção, somente leitura no DP)
  -- 'dp': anotação feita dentro do próprio módulo DP
  origem text NOT NULL CHECK (origem IN ('rh', 'dp')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_colaboradores_timeline_processo_id ON colaboradores_timeline(processo_id);

-- ============================================================
-- Triggers
-- ============================================================

-- Mantém status/data_efetivacao consistentes com estagio_atual sempre que ele
-- muda — regra de negócio ("efetivado" => status ativo; "encerrado" => status
-- encerrado, tira o card do fluxo ativo) fica garantida no backend, não só na UI.
CREATE OR REPLACE FUNCTION trg_colaboradores_processo_sync_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estagio_atual = 'efetivado' THEN
    NEW.status := 'ativo';
    NEW.data_efetivacao := COALESCE(NEW.data_efetivacao, now());
  ELSIF NEW.estagio_atual = 'encerrado' THEN
    NEW.status := 'encerrado';
  ELSE
    NEW.status := 'em_andamento';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER colaboradores_processo_sync_status
  BEFORE INSERT OR UPDATE ON colaboradores_processo
  FOR EACH ROW
  EXECUTE FUNCTION trg_colaboradores_processo_sync_status();

CREATE OR REPLACE FUNCTION trg_colaboradores_documentos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER colaboradores_documentos_set_updated_at
  BEFORE UPDATE ON colaboradores_documentos
  FOR EACH ROW
  EXECUTE FUNCTION trg_colaboradores_documentos_set_updated_at();

-- ============================================================
-- RLS — mesmo padrão do módulo RH (has_rh_access: admin OU permissions.can_manage_rh)
-- ============================================================

ALTER TABLE colaboradores_processo ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY colaboradores_processo_rh_access ON colaboradores_processo
  FOR ALL TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

CREATE POLICY colaboradores_documentos_rh_access ON colaboradores_documentos
  FOR ALL TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

CREATE POLICY colaboradores_contratos_rh_access ON colaboradores_contratos
  FOR ALL TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

CREATE POLICY colaboradores_timeline_rh_access ON colaboradores_timeline
  FOR ALL TO authenticated
  USING (has_rh_access())
  WITH CHECK (has_rh_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON colaboradores_processo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON colaboradores_documentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON colaboradores_contratos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON colaboradores_timeline TO authenticated;
