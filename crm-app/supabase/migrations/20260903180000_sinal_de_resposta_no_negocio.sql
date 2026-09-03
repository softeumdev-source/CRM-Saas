-- O sinal de "o cliente respondeu" no card do board.
--
-- O board NAO assina `mensagens`, e isso e de proposito (migration
-- 20260903141000): uma rodada do despachante insere ate 20 mensagens de saida a
-- cada 5 minutos — ~5.760 por dia — e se o board assinasse essa tabela cada
-- envio de cadencia recarregaria o board de todo mundo que estivesse com a tela
-- aberta.
--
-- Entao o sinal desce por `negocios`, que o board JA assina, com filtro por
-- funil. Como `negocios_do_board` devolve `setof negocios` e o SELECT do card
-- comeca com `*`, as colunas novas chegam a interface sem tocar em uma linha de
-- consulta.

alter table public.negocios
  add column if not exists ultima_resposta_em timestamptz,
  add column if not exists ultima_resposta_canal text
    check (ultima_resposta_canal in ('email', 'whatsapp')),
  add column if not exists respostas_nao_lidas int not null default 0,
  add column if not exists respostas_lidas_em timestamptz,
  add column if not exists ultima_resposta_whatsapp_em timestamptz;

comment on column public.negocios.ultima_resposta_whatsapp_em is
  'Abre a janela de 24h do WhatsApp. Separada de `ultima_resposta_em` DE PROPOSITO: '
  'resposta por e-mail nao abre janela de WhatsApp, e juntar as duas seria a nossa '
  'propria modelagem autorizando texto livre fora da janela da Meta.';

-- Campos que a entrada precisa. `recebida_em` e o carimbo do PROVEDOR, nao o
-- nosso: uma reentrega da Meta pode chegar horas depois, e usar now() ali
-- reabriria a janela de 24h sobre uma mensagem antiga.
alter table public.mensagens
  add column if not exists recebida_em timestamptz,
  add column if not exists automatica boolean not null default false,
  add column if not exists corpo_formato text not null default 'html'
    check (corpo_formato in ('html', 'texto')),
  add column if not exists thread_externo text;

comment on column public.mensagens.automatica is
  'Resposta de maquina (ausencia do escritorio, no-reply, lista). Aparece na conversa '
  'porque e informacao util, mas NAO conta como "o lead respondeu" para parar cadencia.';

comment on column public.mensagens.corpo_formato is
  'texto = corpo e texto puro e deve ser renderizado escapado. html = corpo foi escrito '
  'por NOS (template, IA, humano). E-mail de terceiro entra sempre como texto: HTML de '
  'fora nunca chega ao DOM.';

create index if not exists mensagens_conversa_idx
  on public.mensagens (negocio_id, canal, coalesce(recebida_em, criado_em) desc);

create or replace function public.mensagens_sinalizar_resposta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.negocios n
     set ultima_resposta_em = greatest(
           coalesce(n.ultima_resposta_em, coalesce(new.recebida_em, new.criado_em)),
           coalesce(new.recebida_em, new.criado_em)
         ),
         ultima_resposta_canal = new.canal,
         respostas_nao_lidas = n.respostas_nao_lidas + 1,
         -- `greatest` para que uma reentrega atrasada ou um backfill nao consigam
         -- REBOBINAR nem ESTICAR o relogio da janela de 24h.
         ultima_resposta_whatsapp_em = case
           when new.canal = 'whatsapp' then greatest(
             coalesce(n.ultima_resposta_whatsapp_em, coalesce(new.recebida_em, new.criado_em)),
             coalesce(new.recebida_em, new.criado_em)
           )
           else n.ultima_resposta_whatsapp_em
         end,
         atualizado_em = now()
   where n.id = new.negocio_id;

  -- NAO toca `ultima_atividade_em`, e isso importa em dois lugares:
  -- 1) `negocios_do_board` ordena por essa coluna, entao escrever nela empurraria
  --    para o FUNDO da coluna justamente o lead que acabou de responder;
  -- 2) ela significa "alguem do time fez algo" e acende a bolinha verde do card.
  --    Cliente respondendo nao e a equipe trabalhando.
  return null;
end;
$$;

revoke execute on function public.mensagens_sinalizar_resposta() from public, anon, authenticated;

drop trigger if exists trg_mensagens_sinalizar_resposta on public.mensagens;

-- O `WHEN` fica na DEFINICAO do gatilho, e nao como `if` dentro da funcao, para
-- que os ~5.760 inserts de SAIDA por dia nem cheguem a chamar a funcao.
create trigger trg_mensagens_sinalizar_resposta
after insert on public.mensagens
for each row
when (new.direcao = 'entrada' and new.negocio_id is not null and not new.automatica)
execute function public.mensagens_sinalizar_resposta();
