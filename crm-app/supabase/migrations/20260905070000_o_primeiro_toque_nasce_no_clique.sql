-- ============================================================================
-- O primeiro toque da cadência nasce no clique, e não no próximo cron.
-- ============================================================================
--
-- O RELATO: "cliquei em iniciar uma cadência, não apareceu o e-mail para eu
-- aprovar." Nada estava quebrado. Medido no banco, com horários reais:
--
--   02:00:00  o cron `processar-cadencias` roda (`*/5 * * * *`)
--   02:00:21  a inscrição é criada, 21 segundos DEPOIS do cron passar
--   02:05:00  o cron roda de novo e o e-mail finalmente é gerado
--
-- Quatro minutos e trinta e nove segundos de silêncio. E a tela participa do
-- engano: antes de clicar, o bloco "O que vai acontecer" lista os doze toques
-- com data e hora, e a PRIMEIRA LINHA MOSTRA O HORÁRIO DE AGORA, porque as três
-- cadências têm `atraso_horas = 0` no passo 1. Ao clicar, o plano e o botão
-- somem e sobra "Em andamento · passo 0 · próximo toque em [agora]", sem
-- confirmação e sem nenhuma mensagem na tela. A interface promete "agora" e
-- entrega em até cinco minutos.
--
-- POR QUE A CORREÇÃO VAI NO BANCO E NÃO NO CAMINHO DO CLIQUE. Existem QUATRO
-- escritores de `cadencia_inscricoes`, e todos sofrem do mesmo atraso:
--
--   1. o botão "Inscrever" (insert PostgREST direto, `src/lib/cadencia.ts`)
--   2. Admin -> Leads -> prospecção (`enviar_para_prospeccao`)
--   3. o automático, ao chegar na entrada do SDR
--      (`trg_negocios_inscrever_cadencia`)
--   4. a retomada horária da nutrição (`retomar_leads_em_nutricao`)
--
-- Consertar só o clique deixaria os outros três com o mesmo defeito, e o mesmo
-- relato voltaria por outra porta.
--
-- POR QUE NÃO DUPLICAR A GERAÇÃO NO APP. O primeiro toque precisa das seis
-- guardas que `processar_cadencias` já aplica: consentimento revogado, contato
-- sem canal, passo sem modelo, `parar_se_respondeu`, WhatsApp sem template da
-- Meta virando tarefa manual, e a chave de idempotência. Uma segunda
-- implementação dessas regras é exatamente como um cliente acaba recebendo uma
-- mensagem que não devia.
--
-- ----------------------------------------------------------------------------
-- 1. A FUNÇÃO GANHA UM PARÂMETRO, E O CORPO NÃO MUDA
--
-- A única linha nova é o predicado `and (p_inscricao_id is null or i.id =
-- p_inscricao_id)`. Chamada sem argumento, é exatamente o que o cron sempre fez.
--
-- NÃO DÁ `create or replace`: acrescentar parâmetro cria uma SOBRECARGA, e
-- `select processar_cadencias()` passaria a ser ambíguo -- o cron quebraria com
-- "function is not unique". Por isso o `drop` antes, e por isso as permissões
-- precisam ser refeitas: elas não sobrevivem ao drop, e afrouxá-las por descuido
-- daria a qualquer usuário logado uma função que atende TODOS os tenants.
--
-- CONTRA ERRO DE TRANSCRIÇÃO: são 7.300 caracteres copiados. A asserção do fim
-- compara a impressão digital do corpo novo, com a linha nova descontada, contra
-- a do corpo que estava rodando em produção quando esta migração foi escrita
-- (md5 = 79c53385ecba1180ab590a4ae44d2b8e). Uma vírgula fora do lugar aborta.
--
-- ----------------------------------------------------------------------------
-- 2. O GATILHO, DE MELHOR ESFORÇO
--
-- `AFTER INSERT` em `cadencia_inscricoes`, quando a inscrição já nasce vencida.
--
-- O `exception when others then raise warning` é deliberado. HOJE, se a geração
-- falha, a inscrição sobrevive e o cron tenta de novo. Sem o bloco, um erro
-- transitório passaria a desfazer a própria inscrição -- e no caminho 2
-- derrubaria um lote inteiro de leads por causa de um contato ruim. Com ele:
-- "tenta agora; se der errado, o cron pega". Nunca pior do que era.
--
-- SÓ `AFTER INSERT`. `processar_cadencias` faz `update` em `cadencia_inscricoes`
-- (`passo_atual`, `proximo_envio_em`); um gatilho de UPDATE entraria em
-- recursão. INSERT não recorre: a função não insere nessa tabela.
--
-- ----------------------------------------------------------------------------
-- 3. O CRON PASSA A RODAR DE MINUTO EM MINUTO
--
-- O gatilho resolve o PRIMEIRO toque; os seguintes continuavam com a imprecisão
-- de até cinco minutos. O índice parcial `cadencia_inscricoes_vencidas_idx`
-- cobre exatamente a consulta, então uma execução sem nada vencido é uma busca
-- indexada que devolve zero linhas.
--
-- `disparar-despacho` NÃO muda: ele só entra em cena depois da aprovação.

drop function if exists public.processar_cadencias();

create or replace function public.processar_cadencias(p_inscricao_id uuid default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count int := 0;
  r record;
  v_passo record;
  v_seguinte record;
  v_contato record;
  v_tpl record;
  v_assunto text;
  v_corpo text;
  v_primeiro_nome text;
  v_destino text;
  v_vendedor text;
  v_pular boolean;
  v_manual boolean;
  v_tem_algum_destino boolean;
begin
  for r in
    select i.id, i.negocio_id, i.cadencia_id, i.passo_atual, i.tenant_id, i.criado_em as inscrito_em,
           c.autonoma, n.contato_id, n.titulo as negocio_titulo,
           u.nome as nome_responsavel,
           t.caixa_email_nome as nome_da_caixa
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
      left join public.tenants t on t.id = i.tenant_id
     where i.status = 'ativa'
       and i.proximo_envio_em is not null
       and i.proximo_envio_em <= now()
       and c.ativa
       and (p_inscricao_id is null or i.id = p_inscricao_id)
     order by i.proximo_envio_em
     for update of i skip locked
  loop
    v_pular := false;
    v_manual := false;

    select p.* into v_passo
      from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = r.passo_atual + 1;

    if not found then
      update public.cadencia_inscricoes set status='concluida', proximo_envio_em=null where id=r.id;
      continue;
    end if;

    if v_passo.parar_se_respondeu and exists (
      select 1 from public.mensagens m
       where m.negocio_id = r.negocio_id and m.direcao = 'entrada'
         and not m.automatica
         and coalesce(m.recebida_em, m.criado_em) > r.inscrito_em
    ) then
      update public.cadencia_inscricoes set status='respondeu', proximo_envio_em=null where id=r.id;

      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o lead respondeu antes deste toque sair.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    if exists (
      select 1 from public.consentimentos k
       where k.contato_id = r.contato_id and k.canal = v_passo.canal and k.revogado_em is not null
    ) then
      update public.cadencia_inscricoes set status='cancelada', proximo_envio_em=null where id=r.id;
      update public.mensagens
         set status = 'cancelada',
             ultimo_erro = 'Cancelada: o contato revogou o consentimento neste canal.'
       where negocio_id = r.negocio_id
         and envio_manual
         and status = 'aguardando_aprovacao';
      continue;
    end if;

    v_destino := case when v_passo.canal = 'whatsapp'
                      then coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone)
                      else v_contato.email end;

    if coalesce(v_destino, '') = '' then
      v_tem_algum_destino :=
        coalesce(v_contato.email, '') <> ''
        or coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone, '') <> '';

      if v_tem_algum_destino then
        v_pular := true;
      else
        update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
        insert into public.mensagens (
          tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
          canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
        ) values (
          r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
          v_passo.canal, 'falhou',
          'Cadencia pausada: o contato nao tem e-mail, WhatsApp nem telefone cadastrado.',
          'template', r.id::text || ':' || v_passo.id::text,
          'contato sem nenhum canal'
        ) on conflict (idempotency_key) do nothing;
        continue;
      end if;
    end if;

    if not v_pular then
      select t.* into v_tpl from public.templates_mensagem t where t.id = v_passo.template_id;

      if not found then
        update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
        insert into public.mensagens (
          tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
          canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
        ) values (
          r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
          v_passo.canal, 'falhou',
          'Cadencia pausada: o passo ' || v_passo.ordem || ' esta sem modelo de mensagem.',
          'template', r.id::text || ':' || v_passo.id::text,
          'passo sem modelo'
        ) on conflict (idempotency_key) do nothing;
        continue;
      end if;

      if v_passo.canal = 'whatsapp' and coalesce(v_tpl.template_externo_id, '') = '' then
        v_manual := true;
      end if;
    end if;

    if not v_pular then
      v_primeiro_nome := split_part(coalesce(v_contato.nome, ''), ' ', 1);
      v_vendedor := coalesce(r.nome_da_caixa, r.nome_responsavel, 'Softeum');
      v_assunto := coalesce(v_tpl.assunto, 'Sobre ' || coalesce(v_contato.empresa, r.negocio_titulo));
      v_corpo := coalesce(v_tpl.corpo, '');

      v_assunto := replace(replace(replace(replace(v_assunto,
        '{{primeiro_nome}}', v_primeiro_nome), '{{contato}}', coalesce(v_contato.nome, '')),
        '{{empresa}}', coalesce(v_contato.empresa, '')), '{{vendedor}}', v_vendedor);
      v_corpo := replace(replace(replace(replace(v_corpo,
        '{{primeiro_nome}}', v_primeiro_nome), '{{contato}}', coalesce(v_contato.nome, '')),
        '{{empresa}}', coalesce(v_contato.empresa, '')), '{{vendedor}}', v_vendedor);

      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, destino, assunto, corpo, gerado_por,
        template_externo, variaveis, idempotency_key, agendada_para, envio_manual
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
        v_passo.canal,
        case when r.autonoma and not v_manual then 'aprovada' else 'aguardando_aprovacao' end,
        v_destino,
        case when v_passo.canal = 'email' then v_assunto else null end,
        v_corpo, 'template',
        case when v_passo.canal = 'whatsapp' then v_tpl.template_externo_id else null end,
        case when v_passo.canal = 'whatsapp'
             then array[v_primeiro_nome, coalesce(v_contato.empresa, ''), v_vendedor]
             else null end,
        r.id::text || ':' || v_passo.id::text,
        now(),
        v_manual
      ) on conflict (idempotency_key) do nothing;
    end if;

    select p.* into v_seguinte
      from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = v_passo.ordem + 1;

    if found then
      update public.cadencia_inscricoes
         set passo_atual = v_passo.ordem,
             proximo_envio_em = now() + make_interval(hours => v_seguinte.atraso_horas)
       where id = r.id;
    else
      update public.cadencia_inscricoes
         set passo_atual = v_passo.ordem, status='concluida', proximo_envio_em=null
       where id = r.id;
    end if;

    if not v_pular then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- As permissões NÃO sobrevivem ao `drop`, e afrouxá-las daria a qualquer
-- usuário logado uma função que atende todos os tenants.
revoke execute on function public.processar_cadencias(uuid) from public, anon, authenticated;
grant  execute on function public.processar_cadencias(uuid) to service_role;

create or replace function public.inscricao_gera_o_primeiro_toque()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Melhor esforço: ver o cabeçalho deste arquivo. Um erro aqui NÃO pode
  -- desfazer a inscrição que acabou de ser criada.
  begin
    perform public.processar_cadencias(new.id);
  exception when others then
    raise warning 'Primeiro toque da inscricao % nao saiu agora (%); o cron tenta de novo.',
      new.id, sqlerrm;
  end;
  return null;
end;
$$;

comment on function public.inscricao_gera_o_primeiro_toque() is
  'Gera o primeiro toque no mesmo instante da inscricao, quando ela ja nasce vencida. De melhor esforco: se falhar, o cron continua sendo a rede de seguranca.';

drop trigger if exists trg_inscricao_primeiro_toque on public.cadencia_inscricoes;

create trigger trg_inscricao_primeiro_toque
  after insert on public.cadencia_inscricoes
  for each row
  when (new.status = 'ativa'
        and new.proximo_envio_em is not null
        and new.proximo_envio_em <= now())
  execute function public.inscricao_gera_o_primeiro_toque();

select cron.schedule('processar-cadencias', '* * * * *', 'select public.processar_cadencias();');

do $$
declare
  v_digital text;
begin
  -- O corpo tem que ser o MESMO de antes, tirando a linha nova. 7.300 caracteres
  -- transcritos a mao; isto e o que pega uma virgula fora do lugar.
  select md5(
           regexp_replace(
             regexp_replace(
               replace(pg_get_functiondef('public.processar_cadencias(uuid)'::regprocedure),
                       'and (p_inscricao_id is null or i.id = p_inscricao_id)', ''),
               '^CREATE OR REPLACE FUNCTION[^\n]*\n', ''),
             '\s+', ' ', 'g')
         ) into v_digital;

  if v_digital <> '79c53385ecba1180ab590a4ae44d2b8e' then
    raise exception 'O corpo de processar_cadencias mudou alem da linha nova (digital %).', v_digital;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'processar_cadencias'
       and array_to_string(p.proacl, ' ') like '%authenticated=X%'
  ) then
    raise exception 'processar_cadencias ficou executavel por usuario logado.';
  end if;

  if not exists (select 1 from cron.job where jobname = 'processar-cadencias' and schedule = '* * * * *') then
    raise exception 'O cron nao ficou de minuto em minuto.';
  end if;

  raise notice 'Corpo intacto, permissoes fechadas, cron de minuto em minuto.';
end $$;
