-- ---------------------------------------------------------------------------
-- O gatilho passa a cobrir TUDO que o card do board mostra da atividade.
--
-- Motivo: o board assinava `atividades` no Realtime so por causa de dois casos
-- que o gatilho nao cobria — reagendar (`data_agendada`) e excluir. Essa
-- assinatura era cara e ficou errada: ela nao tem filtro de funil, entao
-- qualquer atividade do SDR (Fase 4) faria o board do vendedor recarregar
-- inteiro, anulando o filtro `pipeline_id` que acabou de entrar. E, como o
-- gatilho tambem atualiza `negocios`, todo insert de atividade disparava DOIS
-- refetches do board inteiro, nao um.
--
-- O card le `id, titulo, tipo, data_agendada, concluida` das atividades
-- pendentes. `titulo` e `tipo` nao sao editaveis em lugar nenhum do app; os
-- outros tres agora tocam o negocio:
--
--   INSERT                      -> ja tocava (e move ultima_atividade_em)
--   concluida muda              -> ja tocava so na ida; agora nos dois sentidos
--   data_agendada muda          -> passa a tocar
--   DELETE                      -> passa a tocar
--
-- Reagendar e excluir NAO mexem em `ultima_atividade_em`: nao houve contato
-- com o cliente, so mudou o proximo passo. Eles so bombeiam `atualizado_em`,
-- que e o que gera o evento de UPDATE em `negocios` para o board redesenhar.
-- ---------------------------------------------------------------------------

create or replace function public.atividades_tocar_negocio()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_quando timestamptz;
begin
  if tg_op = 'DELETE' then
    if old.negocio_id is not null then
      update public.negocios set atualizado_em = now() where id = old.negocio_id;
    end if;
    return old;
  end if;

  if new.negocio_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_quando := coalesce(new.concluida_em, new.criado_em, now());
  elsif new.concluida is distinct from old.concluida and new.concluida is true then
    v_quando := coalesce(new.concluida_em, now());
  else
    -- Reagendamento (ou reabertura de uma concluida): o proximo passo do card
    -- mudou, mas nao houve contato. So marca o negocio como alterado.
    if new.data_agendada is distinct from old.data_agendada
       or new.concluida is distinct from old.concluida then
      update public.negocios set atualizado_em = now() where id = new.negocio_id;
    end if;
    return new;
  end if;

  update public.negocios
     set ultima_atividade_em = greatest(coalesce(ultima_atividade_em, v_quando), v_quando),
         atualizado_em = now()
   where id = new.negocio_id;

  return new;
end;
$function$;

-- A funcao e de gatilho: nao deve existir como endpoint em /rest/v1/rpc/.
revoke execute on function public.atividades_tocar_negocio() from anon, authenticated;

drop trigger if exists trg_atividades_tocar_negocio on public.atividades;
create trigger trg_atividades_tocar_negocio
  after insert or update or delete on public.atividades
  for each row execute function public.atividades_tocar_negocio();
