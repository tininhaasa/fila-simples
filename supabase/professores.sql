-- =====================================================================
-- FILA SIMPLES — professores por turma + convites
--
-- Rode DEPOIS de banco.sql e gestao-alunos.sql:
--   Supabase → SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema.
--
-- Papéis:
--   admin      = admin geral: vê e gerencia TODAS as turmas
--   professor  = vê e gerencia SÓ as turmas em que está vinculado
--   aluno      = vê só a fila da própria turma
--
-- Um professor entra numa turma:
--   * por LINK DE CONVITE gerado por um professor da turma (ou admin), ou
--   * quando o ADMIN GERAL vincula.
-- =====================================================================


-- =====================================================================
-- 1. NOVO PAPEL "professor"
-- =====================================================================
alter table public.fila_usuarios drop constraint if exists fila_usuarios_papel_check;
alter table public.fila_usuarios
  add constraint fila_usuarios_papel_check check (papel in ('aluno', 'professor', 'admin'));


-- =====================================================================
-- 2. TABELAS NOVAS
-- =====================================================================

-- Quais professores dão aula em quais turmas
create table if not exists public.turma_professores (
  turma_id        bigint not null references public.fila_turmas(id) on delete cascade,
  professor_id    uuid   not null references public.fila_usuarios(id) on delete cascade,
  adicionado_por  uuid   references public.fila_usuarios(id) on delete set null,
  criado_em       timestamptz not null default now(),
  primary key (turma_id, professor_id)
);

-- Convites (link de uso único, válido por 7 dias)
create table if not exists public.convites_professor (
  token       uuid primary key default gen_random_uuid(),
  turma_id    bigint not null references public.fila_turmas(id) on delete cascade,
  criado_por  uuid   references public.fila_usuarios(id) on delete set null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null default now() + interval '7 days',
  usado_por   uuid   references public.fila_usuarios(id) on delete set null,
  usado_em    timestamptz
);

alter table public.turma_professores  enable row level security;
alter table public.convites_professor enable row level security;
-- convites_professor: sem policy nenhuma → só acessível pelas funções abaixo


-- =====================================================================
-- 3. FUNÇÕES AUXILIARES (quem pode ver/gerenciar o quê)
-- =====================================================================

create or replace function public.eh_professor_da_turma(p_turma bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.fila_is_admin()
      or exists (select 1 from public.turma_professores tp
                 join public.fila_usuarios u on u.id = tp.professor_id
                 where tp.turma_id = p_turma and tp.professor_id = auth.uid()
                   and u.papel in ('professor', 'admin'));
$$;

-- professor da turma OU aluno da turma
create or replace function public.pode_ver_turma(p_turma bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.eh_professor_da_turma(p_turma)
      or exists (select 1 from public.fila_usuarios
                 where id = auth.uid() and turma_id = p_turma);
$$;

create or replace function public.turma_da_sessao(p_sessao bigint)
returns bigint
language sql stable security definer set search_path = public
as $$ select turma_id from public.fila_sessoes where id = p_sessao; $$;

create or replace function public.turma_do_chamado(p_chamado bigint)
returns bigint
language sql stable security definer set search_path = public
as $$
  select s.turma_id from public.chamados c
  join public.fila_sessoes s on s.id = c.sessao_id
  where c.id = p_chamado;
$$;

create or replace function public.eh_professor()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.fila_usuarios
                     where id = auth.uid() and papel in ('professor', 'admin')); $$;

create or replace function public.exigir_professor_da_turma(p_turma bigint)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_turma is null or not public.eh_professor_da_turma(p_turma) then
    raise exception 'Você não é professor(a) desta turma.';
  end if;
end;
$$;


-- =====================================================================
-- 4. QUEM ENXERGA O QUÊ (RLS)
-- =====================================================================

-- Sessões (filas): só quem é da turma
drop policy if exists sessoes_select on public.fila_sessoes;
create policy sessoes_select on public.fila_sessoes
  for select to authenticated using (public.pode_ver_turma(turma_id));

-- Chamados: só quem é da turma da sessão
drop policy if exists chamados_select on public.chamados;
create policy chamados_select on public.chamados
  for select to authenticated using (public.pode_ver_turma(public.turma_da_sessao(sessao_id)));

-- Usuários: eu mesmo, colegas/alunos das turmas que vejo, e professores dessas turmas
drop policy if exists usuarios_select on public.fila_usuarios;
create policy usuarios_select on public.fila_usuarios
  for select to authenticated using (
    id = auth.uid()
    or public.fila_is_admin()
    or (turma_id is not null and public.pode_ver_turma(turma_id))
    or exists (select 1 from public.turma_professores tp
               where tp.professor_id = fila_usuarios.id and public.pode_ver_turma(tp.turma_id))
  );

-- Vínculos professor↔turma: quem é da turma vê
drop policy if exists turma_professores_select on public.turma_professores;
create policy turma_professores_select on public.turma_professores
  for select to authenticated using (professor_id = auth.uid() or public.pode_ver_turma(turma_id));

grant select on public.turma_professores to authenticated;


-- =====================================================================
-- 5. AÇÕES DA FILA: agora "professor da turma", não só admin
-- =====================================================================

create or replace function public.abrir_sessao(p_turma_id bigint, p_titulo text default null)
returns public.fila_sessoes
language plpgsql security definer set search_path = public
as $$
declare
  v_nova public.fila_sessoes;
begin
  perform public.exigir_professor_da_turma(p_turma_id);

  if exists (select 1 from public.fila_sessoes where turma_id = p_turma_id and ativa) then
    raise exception 'Essa turma já tem uma fila aberta.';
  end if;

  insert into public.fila_sessoes (turma_id, titulo)
  values (p_turma_id, nullif(trim(p_titulo), ''))
  returning * into v_nova;
  return v_nova;
end;
$$;

create or replace function public.encerrar_sessao(p_sessao_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_professor_da_turma(public.turma_da_sessao(p_sessao_id));

  update public.chamados
     set status = 'cancelado', finalizado_em = now()
   where sessao_id = p_sessao_id
     and status in ('aguardando', 'em_atendimento', 'respondido');

  update public.fila_sessoes
     set ativa = false, encerrada_em = now()
   where id = p_sessao_id and ativa;
end;
$$;

create or replace function public.atender_chamado(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sessao bigint;
begin
  perform public.exigir_professor_da_turma(public.turma_do_chamado(p_id));

  select sessao_id into v_sessao from public.chamados
   where id = p_id and status in ('aguardando', 'respondido');
  if v_sessao is null then
    raise exception 'Chamado não encontrado ou já encerrado.';
  end if;

  update public.chamados
     set status = 'aguardando', atendimento_em = null
   where sessao_id = v_sessao and status = 'em_atendimento';

  update public.chamados
     set status = 'em_atendimento', atendimento_em = now(),
         resposta = null, ajudante_id = null, respondido_em = null
   where id = p_id;
end;
$$;

create or replace function public.finalizar_chamado(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_professor_da_turma(public.turma_do_chamado(p_id));

  update public.chamados
     set status = 'resolvido', resolvido_por = 'professora', finalizado_em = now(),
         atendimento_em = coalesce(atendimento_em, now())
   where id = p_id and status in ('aguardando', 'em_atendimento');
  if not found then
    raise exception 'Chamado não encontrado ou já encerrado.';
  end if;
end;
$$;

create or replace function public.aprovar_resposta(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_professor_da_turma(public.turma_do_chamado(p_id));

  update public.chamados
     set status = 'resolvido', resolvido_por = 'colega', finalizado_em = now()
   where id = p_id and status = 'respondido';
  if not found then
    raise exception 'Não há resposta esperando aprovação neste chamado.';
  end if;
end;
$$;

create or replace function public.recusar_resposta(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_professor_da_turma(public.turma_do_chamado(p_id));

  update public.chamados
     set status = 'aguardando', resposta = null, ajudante_id = null, respondido_em = null
   where id = p_id and status = 'respondido';
  if not found then
    raise exception 'Não há resposta esperando aprovação neste chamado.';
  end if;
end;
$$;

create or replace function public.cancelar_chamado(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.chamados
     set status = 'cancelado', finalizado_em = now()
   where id = p_id
     and status in ('aguardando', 'em_atendimento', 'respondido')
     and (aluno_id = auth.uid() or public.eh_professor_da_turma(public.turma_do_chamado(p_id)));
  if not found then
    raise exception 'Chamado não encontrado ou já encerrado.';
  end if;
end;
$$;


-- =====================================================================
-- 6. DASHBOARD: cada professor só vê as próprias turmas
-- =====================================================================

create or replace view public.dash_turmas
with (security_invoker = true) as
select
  t.id       as turma_id,
  t.apelido  as turma,
  (select count(*) from public.fila_usuarios u
    where u.turma_id = t.id and u.papel = 'aluno')                          as alunos,
  (select count(*) from public.fila_sessoes s where s.turma_id = t.id)      as aulas,
  count(c.id)                                                               as chamados,
  count(*) filter (where c.resolvido_por = 'professora')                    as pela_professora,
  count(*) filter (where c.resolvido_por = 'colega')                        as por_colegas,
  count(*) filter (where c.resolvido_por = 'sozinho')                       as sozinhos,
  count(*) filter (where c.status = 'cancelado')                            as cancelados,
  round(avg(extract(epoch from
        coalesce(c.atendimento_em, c.respondido_em, c.finalizado_em) - c.criado_em))
        filter (where c.status = 'resolvido'))::int                         as espera_media_seg
from public.fila_turmas t
left join public.fila_sessoes s on s.turma_id = t.id
left join public.chamados     c on c.sessao_id = s.id
where public.eh_professor_da_turma(t.id)
group by t.id, t.apelido;

create or replace view public.dash_alunos
with (security_invoker = true) as
select
  u.id             as aluno_id,
  u.turma_id,
  u.nome_completo  as nome,
  (select count(*) from public.chamados c where c.aluno_id = u.id)          as chamados,
  (select count(*) from public.chamados c
    where c.ajudante_id = u.id and c.resolvido_por = 'colega')              as ajudas_aprovadas,
  (select count(*) from public.chamados c
    where c.aluno_id = u.id and c.resolvido_por = 'sozinho')                as resolveu_sozinho
from public.fila_usuarios u
where u.papel = 'aluno' and u.turma_id is not null
  and public.eh_professor_da_turma(u.turma_id);


-- =====================================================================
-- 7. GESTÃO DE ALUNOS / PROFESSORES / TURMAS
-- =====================================================================

-- Lista: admin vê todos; professor vê alunos e professores das turmas dele
drop function if exists public.admin_listar_alunos();
create function public.admin_listar_alunos()
returns table (
  id             uuid,
  nome_completo  text,
  matricula      text,
  email          text,
  turma_id       bigint,
  turma          text,
  papel          text,
  turmas_prof    jsonb,      -- turmas em que é professor: [{id, apelido}]
  criado_em      timestamptz,
  ultimo_acesso  timestamptz,
  chamados       bigint,
  ajudas         bigint,
  sozinho        bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.eh_professor() then
    raise exception 'Somente professores podem ver esta lista.';
  end if;

  return query
  select
    u.id, u.nome_completo::text, u.matricula::text, a.email::text,
    u.turma_id, t.apelido::text, u.papel::text,
    coalesce((select jsonb_agg(jsonb_build_object('id', tt.id, 'apelido', tt.apelido) order by tt.apelido)
              from public.turma_professores tp join public.fila_turmas tt on tt.id = tp.turma_id
              where tp.professor_id = u.id), '[]'::jsonb),
    u.created_at, a.last_sign_in_at,
    (select count(*) from public.chamados c where c.aluno_id = u.id),
    (select count(*) from public.chamados c where c.ajudante_id = u.id and c.resolvido_por = 'colega'),
    (select count(*) from public.chamados c where c.aluno_id = u.id and c.resolvido_por = 'sozinho')
  from public.fila_usuarios u
  left join auth.users a         on a.id = u.id
  left join public.fila_turmas t on t.id = u.turma_id
  where public.fila_is_admin()
     or u.id = auth.uid()
     or (u.papel = 'aluno' and u.turma_id is not null and public.eh_professor_da_turma(u.turma_id))
     or exists (select 1 from public.turma_professores tp
                where tp.professor_id = u.id and public.eh_professor_da_turma(tp.turma_id))
  order by t.apelido nulls last, u.nome_completo;
end;
$$;

-- Editar cadastro.
--   Professor: só alunos das turmas dele, só pode mover para turmas dele, não muda papel.
--   Admin: tudo, inclusive papel (aluno / professor / admin).
create or replace function public.admin_salvar_aluno(
  p_id uuid, p_nome text, p_matricula text, p_turma_id bigint, p_papel text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_atual public.fila_usuarios;
begin
  select * into v_atual from public.fila_usuarios where id = p_id;
  if v_atual.id is null then
    raise exception 'Usuário não encontrado.';
  end if;

  if not public.fila_is_admin() then
    if v_atual.papel <> 'aluno' or v_atual.turma_id is null
       or not public.eh_professor_da_turma(v_atual.turma_id) then
      raise exception 'Você só pode editar alunos das suas turmas.';
    end if;
    if p_turma_id is null or not public.eh_professor_da_turma(p_turma_id) then
      raise exception 'Você só pode mover o aluno para uma turma sua.';
    end if;
    if p_papel <> 'aluno' then
      raise exception 'Somente o admin geral pode mudar o papel de alguém.';
    end if;
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_matricula), '') = '' then
    raise exception 'Nome e matrícula são obrigatórios.';
  end if;
  if p_papel not in ('aluno', 'professor', 'admin') then
    raise exception 'Papel inválido.';
  end if;
  if p_id = auth.uid() and p_papel <> 'admin' and v_atual.papel = 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de admin geral.';
  end if;
  if exists (select 1 from public.fila_usuarios where matricula = trim(p_matricula) and id <> p_id) then
    raise exception 'Já existe outro usuário com essa matrícula.';
  end if;

  update public.fila_usuarios
     set nome_completo = trim(p_nome), matricula = trim(p_matricula),
         turma_id = p_turma_id, papel = p_papel
   where id = p_id;

  -- virou aluno: deixa de ser professor das turmas
  if p_papel = 'aluno' then
    delete from public.turma_professores where professor_id = p_id;
  end if;
end;
$$;

-- Remover conta: admin remove qualquer um (menos a si); professor só alunos das turmas dele
create or replace function public.admin_remover_aluno(p_id uuid)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_alvo public.fila_usuarios;
begin
  select * into v_alvo from public.fila_usuarios where id = p_id;
  if p_id = auth.uid() then
    raise exception 'Você não pode remover a sua própria conta.';
  end if;
  if not public.fila_is_admin() and (
       v_alvo.id is null or v_alvo.papel <> 'aluno' or v_alvo.turma_id is null
       or not public.eh_professor_da_turma(v_alvo.turma_id)) then
    raise exception 'Você só pode remover alunos das suas turmas.';
  end if;

  delete from public.fila_usuarios where id = p_id;
  delete from auth.users where id = p_id;
end;
$$;

-- Admin geral define em quais turmas um professor dá aula
create or replace function public.admin_definir_turmas_professor(p_id uuid, p_turmas bigint[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  if not exists (select 1 from public.fila_usuarios where id = p_id and papel in ('professor', 'admin')) then
    raise exception 'Essa pessoa não é professor(a). Mude o papel primeiro.';
  end if;

  delete from public.turma_professores
   where professor_id = p_id and not (turma_id = any (coalesce(p_turmas, '{}')));

  insert into public.turma_professores (turma_id, professor_id, adicionado_por)
  select unnest(coalesce(p_turmas, '{}')), p_id, auth.uid()
  on conflict do nothing;
end;
$$;

-- Tirar um professor da turma: admin geral, ou o próprio professor saindo
create or replace function public.remover_professor_da_turma(p_turma bigint, p_professor uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.fila_is_admin() or p_professor = auth.uid()) then
    raise exception 'Somente o admin geral pode tirar outro professor da turma.';
  end if;
  delete from public.turma_professores where turma_id = p_turma and professor_id = p_professor;
end;
$$;

-- Turmas visíveis (admin: todas; professor: as dele), com professores
drop function if exists public.admin_listar_turmas();
create function public.admin_listar_turmas()
returns table (id bigint, nome text, apelido text, ativa boolean, alunos bigint, aulas bigint, professores jsonb)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.eh_professor() then
    raise exception 'Somente professores podem ver as turmas.';
  end if;

  return query
  select t.id, t.nome::text, t.apelido::text, t.ativa,
         (select count(*) from public.fila_usuarios u where u.turma_id = t.id and u.papel = 'aluno'),
         (select count(*) from public.fila_sessoes s where s.turma_id = t.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome_completo) order by u.nome_completo)
                   from public.turma_professores tp join public.fila_usuarios u on u.id = tp.professor_id
                   where tp.turma_id = t.id), '[]'::jsonb)
  from public.fila_turmas t
  where public.eh_professor_da_turma(t.id)
  order by t.ativa desc, t.apelido;
end;
$$;

-- Criar/editar turma. Qualquer professor pode criar (e fica vinculado a ela);
-- editar só quem é professor da turma.
create or replace function public.admin_salvar_turma(
  p_id bigint, p_nome text, p_apelido text, p_ativa boolean default true
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.eh_professor() then
    raise exception 'Somente professores podem criar ou editar turmas.';
  end if;
  if p_id is not null then
    perform public.exigir_professor_da_turma(p_id);
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Dê um nome para a turma.';
  end if;
  if exists (select 1 from public.fila_turmas
             where lower(nome) = lower(trim(p_nome)) and id is distinct from p_id) then
    raise exception 'Já existe uma turma com esse nome.';
  end if;

  if p_id is null then
    insert into public.fila_turmas (nome, apelido, ativa)
    values (trim(p_nome), coalesce(nullif(trim(p_apelido), ''), trim(p_nome)), coalesce(p_ativa, true))
    returning id into v_id;
    insert into public.turma_professores (turma_id, professor_id, adicionado_por)
    values (v_id, auth.uid(), auth.uid());
  else
    update public.fila_turmas
       set nome = trim(p_nome),
           apelido = coalesce(nullif(trim(p_apelido), ''), trim(p_nome)),
           ativa = coalesce(p_ativa, true)
     where id = p_id;
  end if;
end;
$$;

create or replace function public.admin_excluir_turma(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_professor_da_turma(p_id);

  if exists (select 1 from public.fila_usuarios where turma_id = p_id) then
    raise exception 'A turma tem alunos. Mude os alunos de turma ou apenas desative a turma.';
  end if;
  if exists (select 1 from public.fila_sessoes where turma_id = p_id) then
    raise exception 'A turma já teve aulas com fila. Desative em vez de excluir, para manter o histórico.';
  end if;

  delete from public.fila_turmas where id = p_id;
end;
$$;


-- =====================================================================
-- 8. CONVITES
-- =====================================================================

-- Professor da turma (ou admin) gera um link
create or replace function public.criar_convite(p_turma bigint)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_token uuid;
begin
  perform public.exigir_professor_da_turma(p_turma);
  insert into public.convites_professor (turma_id, criado_por)
  values (p_turma, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;

-- Mostra para quem abriu o link: qual turma, quem convidou, se ainda vale
create or replace function public.ver_convite(p_token uuid)
returns table (turma text, convidado_por text, valido boolean, motivo text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v public.convites_professor;
begin
  select * into v from public.convites_professor where token = p_token;
  if v.token is null then
    return query select null::text, null::text, false, 'Convite não encontrado.'::text;
    return;
  end if;

  return query
  select t.apelido::text, u.nome_completo::text,
         (v.usado_em is null and v.expira_em > now()),
         case when v.usado_em is not null then 'Este convite já foi usado.'
              when v.expira_em <= now()  then 'Este convite expirou. Peça um novo.'
              else null end
  from public.fila_turmas t
  left join public.fila_usuarios u on u.id = v.criado_por
  where t.id = v.turma_id;
end;
$$;

-- Aceita o convite: vira professor (se ainda não for) e entra na turma.
-- Se a pessoa ainda não tem cadastro, informa nome e matrícula aqui.
create or replace function public.aceitar_convite(p_token uuid, p_nome text default null, p_matricula text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v       public.convites_professor;
  v_perfil public.fila_usuarios;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  select * into v from public.convites_professor where token = p_token for update;
  if v.token is null then
    raise exception 'Convite não encontrado.';
  end if;
  if v.usado_em is not null then
    raise exception 'Este convite já foi usado.';
  end if;
  if v.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo ao professor.';
  end if;

  select * into v_perfil from public.fila_usuarios where id = auth.uid();

  if v_perfil.id is null then
    if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_matricula), '') = '' then
      raise exception 'Informe seu nome e matrícula/registro.';
    end if;
    if exists (select 1 from public.fila_usuarios where matricula = trim(p_matricula)) then
      raise exception 'Essa matrícula já está cadastrada.';
    end if;
    insert into public.fila_usuarios (id, nome_completo, matricula, papel)
    values (auth.uid(), trim(p_nome), trim(p_matricula), 'professor');
  elsif v_perfil.papel = 'aluno' then
    update public.fila_usuarios set papel = 'professor', turma_id = null where id = auth.uid();
  end if;

  insert into public.turma_professores (turma_id, professor_id, adicionado_por)
  values (v.turma_id, auth.uid(), v.criado_por)
  on conflict do nothing;

  update public.convites_professor set usado_por = auth.uid(), usado_em = now() where token = p_token;
end;
$$;


-- =====================================================================
-- 9. A CONTA ADMIN ATUAL: vincula a todas as turmas existentes
--    (assim, se um dia virar "professor", continua vendo as turmas)
-- =====================================================================
insert into public.turma_professores (turma_id, professor_id)
select t.id, u.id
from public.fila_turmas t cross join public.fila_usuarios u
where u.papel = 'admin'
on conflict do nothing;


-- =====================================================================
-- 10. PERMISSÕES
-- =====================================================================
revoke execute on function
  public.eh_professor_da_turma(bigint), public.pode_ver_turma(bigint),
  public.turma_da_sessao(bigint), public.turma_do_chamado(bigint), public.eh_professor(),
  public.exigir_professor_da_turma(bigint),
  public.admin_listar_alunos(), public.admin_listar_turmas(),
  public.admin_definir_turmas_professor(uuid, bigint[]), public.remover_professor_da_turma(bigint, uuid),
  public.criar_convite(bigint), public.aceitar_convite(uuid, text, text)
  from public, anon;
grant execute on function
  public.eh_professor_da_turma(bigint), public.pode_ver_turma(bigint),
  public.turma_da_sessao(bigint), public.turma_do_chamado(bigint), public.eh_professor(),
  public.exigir_professor_da_turma(bigint),
  public.admin_listar_alunos(), public.admin_listar_turmas(),
  public.admin_definir_turmas_professor(uuid, bigint[]), public.remover_professor_da_turma(bigint, uuid),
  public.criar_convite(bigint), public.aceitar_convite(uuid, text, text)
  to authenticated;
-- ver o convite funciona até antes de entrar (mostra a turma na tela de login)
grant execute on function public.ver_convite(uuid) to anon, authenticated;
