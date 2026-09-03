-- ---------------------------------------------------------------------------
-- O que sai no WhatsApp nao e o texto que esta em `corpo`.
--
-- Mensagem iniciada pela empresa exige TEMPLATE APROVADO pela Meta: vai o nome
-- do template e a lista de variaveis, e a Meta monta o texto do lado dela. O
-- `corpo` que a cadencia renderiza continua existindo, mas com outro papel — e
-- a previa que a pessoa le na fila de aprovacao. Se ele fosse o que sai, a Meta
-- recusaria todas.
--
-- Guardar as variaveis separadas e o que permite os dois ao mesmo tempo: uma
-- previa legivel para quem aprova, e o payload correto para quem envia.
--
-- A ordem e fixa e documentada: {{1}} primeiro nome, {{2}} empresa,
-- {{3}} vendedor. O template aprovado na Meta precisa usar essa mesma ordem.
--
-- `processar_cadencias` tambem passa a recusar o passo quando o template nao
-- tem id da Meta: sem ele a mensagem seria recusada no envio, e falhar cedo,
-- com motivo legivel, e melhor do que falhar cinco vezes contra a API. O
-- destino do WhatsApp sai de `contatos.whatsapp`, com `telefone` como reserva.
-- ---------------------------------------------------------------------------

alter table public.mensagens
  add column if not exists template_externo text,
  add column if not exists variaveis text[];

comment on column public.mensagens.template_externo is
  'Nome do template aprovado na Meta. So o WhatsApp usa; no e-mail o que vale e assunto + corpo.';
comment on column public.mensagens.variaveis is
  'Valores das variaveis do template, em ordem: {{1}} primeiro nome, {{2}} empresa, {{3}} vendedor.';

create or replace function public.processar_cadencias()
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_count int := 0;
  r record; v_passo record; v_seguinte record; v_contato record; v_tpl record;
  v_assunto text; v_corpo text; v_primeiro_nome text; v_destino text; v_vendedor text;
begin
  for r in
    select i.id, i.negocio_id, i.cadencia_id, i.passo_atual, i.tenant_id,
           c.autonoma, n.contato_id, n.titulo as negocio_titulo, u.nome as nome_responsavel
      from public.cadencia_inscricoes i
      join public.cadencias c on c.id = i.cadencia_id
      join public.negocios n on n.id = i.negocio_id
      left join public.usuarios u on u.id = n.responsavel_id
     where i.status = 'ativa' and i.proximo_envio_em is not null
       and i.proximo_envio_em <= now() and c.ativa
     order by i.proximo_envio_em
     for update of i skip locked
  loop
    select p.* into v_passo from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = r.passo_atual + 1;

    if not found then
      update public.cadencia_inscricoes set status='concluida', proximo_envio_em=null where id=r.id;
      continue;
    end if;

    if v_passo.parar_se_respondeu and exists (
      select 1 from public.mensagens m where m.negocio_id = r.negocio_id and m.direcao = 'entrada'
    ) then
      update public.cadencia_inscricoes set status='respondeu', proximo_envio_em=null where id=r.id;
      continue;
    end if;

    select c.* into v_contato from public.contatos c where c.id = r.contato_id;

    if exists (
      select 1 from public.consentimentos k
       where k.contato_id = r.contato_id and k.canal = v_passo.canal and k.revogado_em is not null
    ) then
      update public.cadencia_inscricoes set status='cancelada', proximo_envio_em=null where id=r.id;
      continue;
    end if;

    v_destino := case when v_passo.canal = 'whatsapp'
                      then coalesce(nullif(v_contato.whatsapp, ''), v_contato.telefone)
                      else v_contato.email end;

    if coalesce(v_destino, '') = '' then
      update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id, v_passo.canal, 'falhou',
        case when v_passo.canal = 'whatsapp'
             then 'Cadencia pausada: o contato nao tem WhatsApp nem telefone cadastrado.'
             else 'Cadencia pausada: o contato nao tem e-mail cadastrado.' end,
        'template', r.id::text || ':' || v_passo.id::text,
        case when v_passo.canal = 'whatsapp' then 'contato sem whatsapp' else 'contato sem e-mail' end
      ) on conflict (idempotency_key) do nothing;
      continue;
    end if;

    select t.* into v_tpl from public.templates_mensagem t where t.id = v_passo.template_id;

    -- WhatsApp sem template aprovado na Meta nao tem como sair.
    if v_passo.canal = 'whatsapp' and coalesce(v_tpl.template_externo_id, '') = '' then
      update public.cadencia_inscricoes set status='pausada', proximo_envio_em=null where id=r.id;
      insert into public.mensagens (
        tenant_id, negocio_id, contato_id, inscricao_id, passo_id,
        canal, status, corpo, gerado_por, idempotency_key, ultimo_erro
      ) values (
        r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id, 'whatsapp', 'falhou',
        'Cadencia pausada: o modelo deste passo nao tem template aprovado na Meta.',
        'template', r.id::text || ':' || v_passo.id::text, 'template sem id da Meta'
      ) on conflict (idempotency_key) do nothing;
      continue;
    end if;

    v_primeiro_nome := split_part(coalesce(v_contato.nome, ''), ' ', 1);
    v_vendedor := coalesce(r.nome_responsavel, 'Softeum');
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
      template_externo, variaveis, idempotency_key, agendada_para
    ) values (
      r.tenant_id, r.negocio_id, r.contato_id, r.id, v_passo.id, v_passo.canal,
      case when r.autonoma then 'aprovada' else 'aguardando_aprovacao' end,
      v_destino,
      case when v_passo.canal = 'email' then v_assunto else null end,
      v_corpo, 'template',
      case when v_passo.canal = 'whatsapp' then v_tpl.template_externo_id else null end,
      case when v_passo.canal = 'whatsapp'
           then array[v_primeiro_nome, coalesce(v_contato.empresa, ''), v_vendedor] else null end,
      r.id::text || ':' || v_passo.id::text, now()
    ) on conflict (idempotency_key) do nothing;

    select p.* into v_seguinte from public.cadencia_passos p
     where p.cadencia_id = r.cadencia_id and p.ordem = v_passo.ordem + 1;

    if found then
      update public.cadencia_inscricoes
         set passo_atual = v_passo.ordem,
             proximo_envio_em = now() + make_interval(hours => v_seguinte.atraso_horas)
       where id = r.id;
    else
      update public.cadencia_inscricoes
         set passo_atual = v_passo.ordem, status='concluida', proximo_envio_em=null where id=r.id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.processar_cadencias() from public, anon, authenticated;
