-- O gatilho passa a IGNORAR o funil do vendedor, por regra e não por acaso.
--
-- Hoje nenhum card de Vendas é inscrito, mas só porque não existe cadência
-- apontando para aquele funil. É coincidência, não garantia: no dia em que
-- alguém criar uma cadência em Admin → Cadências e escolher "Vendas" no
-- seletor, todo card que entrasse em "Novo Lead" de Vendas começaria a receber
-- e-mail de prospecção — para leads que JÁ SÃO do vendedor, muitos deles com
-- conversa em andamento.
--
-- A regra é explícita: só inscreve em funil que PROSPECTA, e prospectar é ter
-- `role_operador = 'sdr'`. O funil do vendedor não abre cadência sozinho, e o
-- botão "Inscrever" da aba Cadência continua lá para quem quiser começar uma na
-- mão, caso a caso.
--
-- É a mesma coluna que a RLS e a RPC de transferência já usam para decidir de
-- quem é cada funil — não um critério novo inventado aqui.

create or replace function public.inscrever_ao_chegar_na_prospeccao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_funcao text;
  v_pipeline uuid;
  v_papel text;
  v_proposito text;
  v_cad uuid;
  v_atraso int;
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;

  select e.funcao, e.pipeline_id into v_funcao, v_pipeline
    from public.etapas_pipeline e where e.id = new.etapa_id;

  -- A TRAVA: só funil de prospecção. O board do vendedor nunca inscreve
  -- ninguém sozinho, mesmo que um dia exista cadência apontada para ele.
  select p.role_operador into v_papel
    from public.pipelines p where p.id = v_pipeline;
  if v_papel is distinct from 'sdr' then
    return new;
  end if;

  if v_funcao = 'entrada' then
    v_proposito := 'primeiro_contato';
  elsif v_funcao = 'retorno' then
    if not exists (
      select 1 from public.atividades a
       where a.negocio_id = new.id
         and a.compareceu is false
         and a.data_agendada > now() - interval '30 days'
    ) then
      return new;
    end if;
    v_proposito := 'no_show';
  else
    return new;
  end if;

  if exists (
    select 1 from public.cadencia_inscricoes i
     where i.negocio_id = new.id and i.status in ('ativa', 'pausada')
  ) then
    return new;
  end if;

  select c.id into v_cad
    from public.cadencias c
   where c.pipeline_id = v_pipeline and c.proposito = v_proposito and c.ativa
   order by c.criado_em
   limit 1;
  if v_cad is null then return new; end if;

  select p.atraso_horas into v_atraso
    from public.cadencia_passos p where p.cadencia_id = v_cad order by p.ordem limit 1;
  if v_atraso is null then return new; end if;

  insert into public.cadencia_inscricoes
    (tenant_id, negocio_id, cadencia_id, proximo_envio_em)
  values
    (new.tenant_id, new.id, v_cad, now() + make_interval(hours => v_atraso))
  on conflict do nothing;

  return new;
end;
$function$;

comment on function public.inscrever_ao_chegar_na_prospeccao() is
  'Comeca a cadencia sozinha SO no funil de prospeccao (role_operador = sdr): '
  'na etapa de entrada (primeiro contato) ou na de retorno depois de um '
  'no-show (remarcacao). O board do vendedor nunca inscreve ninguem sozinho.';
