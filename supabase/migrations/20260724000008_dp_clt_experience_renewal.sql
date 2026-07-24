-- Renovação do contrato de experiência CLT (45d + 45d = 90d) — pedido do
-- usuário. Registra quando a renovação foi feita (ato manual, botão no
-- card); a data em si não trava nada, é só o carimbo que liga a tag
-- "Exp. 45d 2/2" (senão fica "Exp. 45d 1/2", ver dpConstants.ts
-- getExperienceInfo). MEI não usa esta coluna — janela única de 90d,
-- sem renovação formal.

ALTER TABLE employee_processes ADD COLUMN experience_renewed_at timestamptz;
