-- ---------------------------------------------------------------------------
-- A reuniao agendada no CRM passa a poder apontar para o evento real na agenda.
--
-- Sem esse vinculo, o convite do Google e a atividade do CRM seriam duas
-- reunioes que por acaso tem o mesmo horario: nao daria para saber se o convite
-- ja foi mandado, nem para ler depois como o convidado respondeu — que e
-- justamente o que sustenta o no-show.
--
-- `google_evento_id` tambem serve de trava: com ele preenchido, a tela nao
-- oferece criar o convite de novo, e um clique duplo nao vira dois convites na
-- caixa do cliente.
-- ---------------------------------------------------------------------------

alter table public.atividades
  add column if not exists google_evento_id text,
  add column if not exists google_meet_link text,
  add column if not exists google_resposta text;

comment on column public.atividades.google_resposta is
  'Como o convidado respondeu ao convite. NAO prova comparecimento — a Google nao sabe quem entrou na sala; quem responde "compareceu?" continua sendo o vendedor.';

create index if not exists atividades_google_evento_idx
  on public.atividades (google_evento_id)
  where google_evento_id is not null;
