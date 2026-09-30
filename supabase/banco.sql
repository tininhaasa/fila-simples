-- =====================================================================
-- FILA SIMPLES — banco de dados (Supabase)
--
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- Pode rodar no mesmo projeto onde você já rodou o supabase-setup.sql
-- do fila-chamados: as tabelas de turmas, usuários e sessões são
-- REAPROVEITADAS (mesmas contas, mesmas turmas). Também funciona num
-- projeto vazio. Rodar de novo não duplica nada.
--
-- Ideia geral:
--   * Os alunos só LEEM as tabelas direto.
--   * Toda ação (abrir chamado, responder colega, aprovar...) é uma
--     FUNÇÃO no banco. A função confere quem está chamando e se a ação
--     é permitida. Assim as regras ficam num lugar só.
-- =====================================================================


-- =====================================================================
-- 1. TABELAS BASE (as mesmas do fila-chamados — criadas só se faltarem)
-- =====================================================================

create table if not exists public.fila_turmas (
  id          bigint generated always as identity primary key,
  nome        varchar(100) not null unique,
  apelido     varchar(50)  not null,
  ativa       boolean      not null default true,
  created_at  timestamptz  not null default now()
);

create table if not exists public.fila_usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome_completo  varchar(150) not null,
  matricula      varchar(30)  not null unique,
  turma_id       bigint references public.fila_turmas(id),
  papel          varchar(10)  not null default 'aluno'
                 check (papel in ('aluno', 'admin')),
  created_at     timestamptz  not null default now()
);

create table if not exists public.fila_sessoes (
  id            bigint generated always as identity primary key,
  turma_id      bigint not null references public.fila_turmas(id),
  titulo        varchar(150),
  ativa         boolean     not null default true,
  iniciada_em   timestamptz not null default now(),
  encerrada_em  timestamptz
);

create unique index if not exists fila_sessoes_uma_ativa_por_turma
  on public.fila_sessoes (turma_id) where ativa;

create or replace function public.fila_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.fila_usuarios
                 where id = auth.uid() and papel = 'admin');
$$;

alter table public.fila_turmas   enable row level security;
alter table public.fila_usuarios enable row level security;
alter table public.fila_sessoes  enable row level security;

drop policy if exists turmas_select on public.fila_turmas;
create policy turmas_select on public.fila_turmas
  for select to anon, authenticated using (true);

drop policy if exists turmas_admin on public.fila_turmas;
create policy turmas_admin on public.fila_turmas
  for all to authenticated
  using (public.fila_is_admin()) with check (public.fila_is_admin());

drop policy if exists usuarios_select on public.fila_usuarios;
create policy usuarios_select on public.fila_usuarios
  for select to authenticated using (true);

drop policy if exists usuarios_insert_proprio on public.fila_usuarios;
create policy usuarios_insert_proprio on public.fila_usuarios
  for insert to authenticated
  with check (id = auth.uid() and papel = 'aluno');

drop policy if exists usuarios_admin_update on public.fila_usuarios;
create policy usuarios_admin_update on public.fila_usuarios
  for update to authenticated
  using (public.fila_is_admin()) with check (public.fila_is_admin());

drop policy if exists sessoes_select on public.fila_sessoes;
create policy sessoes_select on public.fila_sessoes
  for select to authenticated using (true);


-- =====================================================================
-- 2. CHAMADOS (tabela nova, só deste app)
-- =====================================================================
--
-- Caminho de um chamado:
--
--   aguardando ──(colega responde)──► respondido ──(professora aprova)──► resolvido (colega)
--       │  ▲                              │
--       │  └──────(professora recusa)─────┘
--       │
--       ├──(professora atende)──► em_atendimento ──(finaliza)──► resolvido (professora)
--       ├──(aluno: "resolvi sozinho")──────────────────────────► resolvido (sozinho)
--       └──(aluno ou professora cancela / sessão encerrada)────► cancelado

create table if not exists public.chamados (
  id              bigint generated always as identity primary key,
  sessao_id       bigint not null references public.fila_sessoes(id) on delete cascade,
  aluno_id        uuid   not null references public.fila_usuarios(id) on delete cascade,
  pergunta        varchar(300) not null,
  status          varchar(20)  not null default 'aguardando'
                  check (status in ('aguardando', 'em_atendimento', 'respondido', 'resolvido', 'cancelado')),

  -- resposta de um colega (fica aguardando aprovação da professora)
  resposta        varchar(1000),
  ajudante_id     uuid references public.fila_usuarios(id) on delete set null,
  respondido_em   timestamptz,

  -- quem resolveu, no fim
  resolvido_por   varchar(15)
                  check (resolvido_por in ('professora', 'colega', 'sozinho')),

  criado_em       timestamptz not null default now(),
  atendimento_em  timestamptz,
  finalizado_em   timestamptz
);

-- Cada aluno só pode ter um chamado aberto por vez
create unique index if not exists chamados_um_aberto_por_aluno
  on public.chamados (aluno_id)
  where status in ('aguardando', 'em_atendimento', 'respondido');

create index if not exists chamados_sessao_idx
  on public.chamados (sessao_id, status, criado_em);

alter table public.chamados enable row level security;

-- Todos os logados podem LER. Ninguém escreve direto: só pelas funções.
drop policy if exists chamados_select on public.chamados;
create policy chamados_select on public.chamados
  for select to authenticated using (true);


-- =====================================================================
-- 3. FUNÇÕES — AÇÕES DO ALUNO
-- =====================================================================

-- Abre um chamado na sessão ativa da turma do aluno
create or replace function public.abrir_chamado(p_pergunta text)
returns public.chamados
language plpgsql security definer set search_path = public
as $$
declare
  v_sessao  bigint;
  v_novo    public.chamados;
begin
  if coalesce(trim(p_pergunta), '') = '' then
    raise exception 'Escreva a sua dúvida.';
  end if;

  select s.id into v_sessao
  from public.fila_sessoes s
  join public.fila_usuarios u on u.turma_id = s.turma_id
  where u.id = auth.uid() and s.ativa;

  if v_sessao is null then
    raise exception 'A fila da sua turma não está aberta agora.';
  end if;

  if exists (select 1 from public.chamados
             where aluno_id = auth.uid()
               and status in ('aguardando', 'em_atendimento', 'respondido')) then
    raise exception 'Você já tem um chamado aberto.';
  end if;

  insert into public.chamados (sessao_id, aluno_id, pergunta)
  values (v_sessao, auth.uid(), left(trim(p_pergunta), 300))
  returning * into v_novo;

  return v_novo;
end;
$$;

-- Aluno cancela o próprio chamado (a professora pode cancelar qualquer um)
create or replace function public.cancelar_chamado(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.chamados
     set status = 'cancelado', finalizado_em = now()
   where id = p_id
     and status in ('aguardando', 'em_atendimento', 'respondido')
     and (aluno_id = auth.uid() or public.fila_is_admin());

  if not found then
    raise exception 'Chamado não encontrado ou já encerrado.';
  end if;
end;
$$;

-- Aluno avisa que resolveu sozinho
create or replace function public.resolvi_sozinho(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.chamados
     set status = 'resolvido', resolvido_por = 'sozinho', finalizado_em = now(),
         resposta = null, ajudante_id = null, respondido_em = null
   where id = p_id
     and aluno_id = auth.uid()
     and status in ('aguardando', 'respondido');

  if not found then
    raise exception 'Chamado não encontrado ou já encerrado.';
  end if;
end;
$$;

-- Colega da MESMA turma responde a dúvida de outro aluno.
-- A resposta fica "respondido" até a professora aprovar ou recusar.
create or replace function public.responder_chamado(p_id bigint, p_resposta text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ch public.chamados;
begin
  if coalesce(trim(p_resposta), '') = '' then
    raise exception 'Escreva a sua resposta.';
  end if;

  select c.* into v_ch
  from public.chamados c
  join public.fila_sessoes  s on s.id = c.sessao_id
  join public.fila_usuarios u on u.turma_id = s.turma_id
  where c.id = p_id and u.id = auth.uid()
  for update of c;

  if v_ch.id is null then
    raise exception 'Você só pode responder chamados da sua turma.';
  end if;
  if v_ch.aluno_id = auth.uid() then
    raise exception 'Você não pode responder o seu próprio chamado.';
  end if;
  if v_ch.status <> 'aguardando' then
    raise exception 'Este chamado já está sendo atendido ou já foi respondido.';
  end if;

  update public.chamados
     set status = 'respondido',
         resposta = left(trim(p_resposta), 1000),
         ajudante_id = auth.uid(),
         respondido_em = now()
   where id = p_id;
end;
$$;


-- =====================================================================
-- 4. FUNÇÕES — AÇÕES DA PROFESSORA (só admin)
-- =====================================================================

create or replace function public.exigir_admin()
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.fila_is_admin() then
    raise exception 'Somente a professora pode fazer isso.';
  end if;
end;
$$;

-- Abre a fila para uma turma
create or replace function public.abrir_sessao(p_turma_id bigint, p_titulo text default null)
returns public.fila_sessoes
language plpgsql security definer set search_path = public
as $$
declare
  v_nova public.fila_sessoes;
begin
  perform public.exigir_admin();

  if exists (select 1 from public.fila_sessoes where turma_id = p_turma_id and ativa) then
    raise exception 'Essa turma já tem uma fila aberta.';
  end if;

  insert into public.fila_sessoes (turma_id, titulo)
  values (p_turma_id, nullif(trim(p_titulo), ''))
  returning * into v_nova;

  return v_nova;
end;
$$;

-- Fecha a fila; chamados que ficaram abertos são cancelados
create or replace function public.encerrar_sessao(p_sessao_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  update public.chamados
     set status = 'cancelado', finalizado_em = now()
   where sessao_id = p_sessao_id
     and status in ('aguardando', 'em_atendimento', 'respondido');

  update public.fila_sessoes
     set ativa = false, encerrada_em = now()
   where id = p_sessao_id and ativa;
end;
$$;

-- Chama um aluno para atendimento (se já havia outro em atendimento
-- na mesma sessão, ele volta para a fila no mesmo lugar)
create or replace function public.atender_chamado(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sessao bigint;
begin
  perform public.exigir_admin();

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

-- Professora terminou de atender
create or replace function public.finalizar_chamado(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  update public.chamados
     set status = 'resolvido', resolvido_por = 'professora', finalizado_em = now(),
         atendimento_em = coalesce(atendimento_em, now())
   where id = p_id and status in ('aguardando', 'em_atendimento');

  if not found then
    raise exception 'Chamado não encontrado ou já encerrado.';
  end if;
end;
$$;

-- Aprova a resposta do colega → conta como ajuda para ele
create or replace function public.aprovar_resposta(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  update public.chamados
     set status = 'resolvido', resolvido_por = 'colega', finalizado_em = now()
   where id = p_id and status = 'respondido';

  if not found then
    raise exception 'Não há resposta esperando aprovação neste chamado.';
  end if;
end;
$$;

-- Recusa a resposta → chamado volta para a fila, no mesmo lugar
create or replace function public.recusar_resposta(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  update public.chamados
     set status = 'aguardando', resposta = null, ajudante_id = null, respondido_em = null
   where id = p_id and status = 'respondido';

  if not found then
    raise exception 'Não há resposta esperando aprovação neste chamado.';
  end if;
end;
$$;


-- =====================================================================
-- 5. VIEWS DO DASHBOARD (só a professora vê linhas)
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
where public.fila_is_admin()
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
where u.papel = 'aluno' and public.fila_is_admin();


-- =====================================================================
-- 6. PERMISSÕES
-- =====================================================================

grant usage on schema public to anon, authenticated;
grant select on public.fila_turmas to anon;
grant select on public.fila_turmas, public.fila_usuarios, public.fila_sessoes,
                public.chamados, public.dash_turmas, public.dash_alunos
  to authenticated;
grant insert on public.fila_usuarios to authenticated;                 -- completar perfil
grant update on public.fila_usuarios, public.fila_turmas to authenticated; -- (RLS: só admin)
grant insert, delete on public.fila_turmas to authenticated;           -- (RLS: só admin)

-- Funções: só usuários logados podem chamar
revoke execute on function
  public.abrir_chamado(text), public.cancelar_chamado(bigint), public.resolvi_sozinho(bigint),
  public.responder_chamado(bigint, text), public.abrir_sessao(bigint, text),
  public.encerrar_sessao(bigint), public.atender_chamado(bigint), public.finalizar_chamado(bigint),
  public.aprovar_resposta(bigint), public.recusar_resposta(bigint), public.exigir_admin()
  from public, anon;
grant execute on function
  public.abrir_chamado(text), public.cancelar_chamado(bigint), public.resolvi_sozinho(bigint),
  public.responder_chamado(bigint, text), public.abrir_sessao(bigint, text),
  public.encerrar_sessao(bigint), public.atender_chamado(bigint), public.finalizar_chamado(bigint),
  public.aprovar_resposta(bigint), public.recusar_resposta(bigint), public.exigir_admin()
  to authenticated;
grant execute on function public.fila_is_admin() to anon, authenticated;


-- =====================================================================
-- 7. TEMPO REAL
-- =====================================================================

do $$
declare
  tabela text;
begin
  foreach tabela in array array['chamados', 'fila_sessoes'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = tabela) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end $$;


-- =====================================================================
-- 8. SE O PROJETO FOR NOVO (pule se já fez isso no fila-chamados)
-- =====================================================================
-- insert into public.fila_turmas (nome, apelido) values
--   ('Noturno Otacílio', 'Noturno Otacílio'),
--   ('Vespertino Otacílio', 'Vespertino Otacílio');
--
-- Depois de criar a sua conta pelo app:
-- update public.fila_usuarios set papel = 'admin' where matricula = 'SUA_MATRICULA';
