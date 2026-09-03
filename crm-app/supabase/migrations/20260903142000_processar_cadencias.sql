-- ---------------------------------------------------------------------------
-- O relogio da cadencia. Roda no Postgres porque o plano Hobby da Vercel so
-- permite um cron por dia; `pg_cron` ja bate de 5 em 5 minutos.
--
-- A divisao e proposital: o banco decide O QUE venceu (barato e transacional),
-- e a rota do Next faz a CHAMADA EXTERNA (e onde estao os SDKs e os segredos).
-- Esta funcao nao envia nada — ela so materializa a mensagem.
--
-- `for update ... skip locked` deixa duas execucoes simultaneas dividirem a
-- fila em vez de brigarem pela mesma inscricao.
--
-- A idempotencia e uma chave unica por (inscricao, passo): rodar o processador
-- duas vezes sobre a mesma fila nao cria a segunda mensagem, o `on conflict do
-- nothing` a descarta. E a diferenca entre um cliente receber um e-mail e
-- receber dois.
--
-- Tres portas de saida antes de gerar qualquer coisa, e nenhuma delas e
-- silenciosa:
--   1. o lead respondeu            -> inscricao vira 'respondeu' e para;
--   2. o contato pediu descadastro -> inscricao vira 'cancelada' e para;
--   3. o contato nao tem e-mail    -> inscricao 'pausada' e uma mensagem
--      'falhou' explicando, porque um lead sem e-mail queimando passos em
--      silencio e o jeito de descobrir tarde demais.
-- ---------------------------------------------------------------------------

create or replace function public.processar_cadencias()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count int := 0;
  r record;
  v_passo record;
  v_seguinte record;
  v_contato record;
  v_assunto text;
  v_corpo text;
  v_primeiro_nome text;
begin
  for r in
    select i.id, i.negocio_id, i.cadencia_id, i.passo_atual, i.tenant_id,
           c.autonoma, n.contato_id, n.titulo as negocio_titulo,
           u.nome as nome_responsavel
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
     where i.status = 'ativa'
       and i.proximo_envio_em is not null
       and i.proximo_envio_em <= now()
       and c.ativa
     order by i.proximo_envio_em
     for update of i skip locked
  loop
    select p.* into v_passo
      from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = r.passo_atual + 1;

    if not found then
      update public.cadencia_inscricoes
         set status = 'concluida', proximo_envio_em = null
       where id = r.id;
      continue;
    end if;

    if v_passo.parar_se_respondeu and exists (
      select 1 from public.mensagens m
       where m.negocio_id = r.negocio_id and m.direcao = 'entrada'
    ) then
      update public.cadencia_inscricoes
         set status = 'respondeu', proximo_envio_em = null
       where id = r.id;
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    if exists (
      select 1 from public.consentimentos k
       where k.contato_id = r.contato_id
         and k.canal = v_passo.canal
         and k.revogado_em is not null
    ) then
      update public.cadencia_inscricoes
         set status = 'cancelada', proximo_envio_em = null
       where id = r.id;
      continue;
    end if;

    if v_passo.canal = 'email' and coalesce(v_contato.email, '') = '' then
      update public.cadencia_inscricoes
         set status = 'pausada', proximo_envio_em = null
       where id = r.id;

      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
        v_passo.canal, 'falhou',
        'Cadencia pausada: o contato nao tem e-mail cadastrado.',
        'template', r.id::text || ':' || v_passo.id::text,
        'contato sem e-mail'
      )
      on conflict (idempotency_key) do nothing;
      continue;
    end if;

    v_primeiro_nome := split_part(coalesce(v_contato.nome, ''), ' ', 1);
    select t.assunto, t.corpo
      into v_assunto, v_corpo
      from public.templates_mensagem t
     where t.id = v_passo.template_id;

    v_assunto := coalesce(v_assunto, 'Sobre ' || coalesce(v_contato.empresa, r.negocio_titulo));
    v_corpo := coalesce(v_corpo, '');

    v_assunto := replace(replace(replace(replace(v_assunto,
      '{{primeiro_nome}}', v_primeiro_nome),
      '{{contato}}', coalesce(v_contato.nome, '')),
      '{{empresa}}', coalesce(v_contato.empresa, '')),
      '{{vendedor}}', coalesce(r.nome_responsavel, 'Softeum'));
    v_corpo := replace(replace(replace(replace(v_corpo,
      '{{primeiro_nome}}', v_primeiro_nome),
      '{{contato}}', coalesce(v_contato.nome, '')),
      '{{empresa}}', coalesce(v_contato.empresa, '')),
      '{{vendedor}}', coalesce(r.nome_responsavel, 'Softeum'));

    insert into public.mensagens (
      tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
      canal, status, destino, assunto, corpo, gerado_por,
      idempotency_key, agendada_para
    ) values (
      r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id,
      v_passo.canal,
      -- O interruptor de autonomia. Falso por padrao: mensagem enviada e
      -- irreversivel, entao o comeco e com humano no meio.
      case when r.autonoma then 'aprovada' else 'aguardando_aprovacao' end,
      v_contato.email, v_assunto, v_corpo, 'template',
      r.id::text || ':' || v_passo.id::text,
      now()
    )
    on conflict (idempotency_key) do nothing;

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
         set passo_atual = v_passo.ordem,
             status = 'concluida',
             proximo_envio_em = null
       where id = r.id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.processar_cadencias() from public, anon, authenticated;

select cron.schedule(
  'processar-cadencias',
  '*/5 * * * *',
  'select public.processar_cadencias();'
);
