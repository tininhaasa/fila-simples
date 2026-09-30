-- =====================================================================
-- FILA SIMPLES — gestão de alunos e turmas (painel da professora)
--
-- Rode DEPOIS do banco.sql: Supabase → SQL Editor → New query → Run.
-- Pode rodar de novo sem problema.
-- Todas as funções exigem que quem chama seja admin (professora).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Lista todos os usuários com e-mail, turma, último acesso e números
-- (o e-mail fica em auth.users, que o app não enxerga direto)
-- ---------------------------------------------------------------------
create or replace function public.admin_listar_alunos()
returns table (
  id             uuid,
  nome_completo  text,
  matricula      text,
  email          text,
  turma_id       bigint,
  turma          text,
  papel          text,
  criado_em      timestamptz,
  ultimo_acesso  timestamptz,
  chamados       bigint,
  ajudas         bigint,
  sozinho        bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  return query
  select
    u.id,
    u.nome_completo::text,
    u.matricula::text,
    a.email::text,
    u.turma_id,
    t.apelido::text,
    u.papel::text,
    u.created_at,
    a.last_sign_in_at,
    (select count(*) from public.chamados c where c.aluno_id = u.id),
    (select count(*) from public.chamados c
      where c.ajudante_id = u.id and c.resolvido_por = 'colega'),
    (select count(*) from public.chamados c
      where c.aluno_id = u.id and c.resolvido_por = 'sozinho')
  from public.fila_usuarios u
  left join auth.users a         on a.id = u.id
  left join public.fila_turmas t on t.id = u.turma_id
  order by t.apelido nulls last, u.nome_completo;
end;
$$;


-- ---------------------------------------------------------------------
-- Edita nome, matrícula, turma e papel de um usuário
-- ---------------------------------------------------------------------
create or replace function public.admin_salvar_aluno(
  p_id         uuid,
  p_nome       text,
  p_matricula  text,
  p_turma_id   bigint,
  p_papel      text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_matricula), '') = '' then
    raise exception 'Nome e matrícula são obrigatórios.';
  end if;
  if p_papel not in ('aluno', 'admin') then
    raise exception 'Papel inválido.';
  end if;
  if p_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de professora.';
  end if;
  if exists (select 1 from public.fila_usuarios
             where matricula = trim(p_matricula) and id <> p_id) then
    raise exception 'Já existe outro usuário com essa matrícula.';
  end if;

  update public.fila_usuarios
     set nome_completo = trim(p_nome),
         matricula     = trim(p_matricula),
         turma_id      = p_turma_id,
         papel         = p_papel
   where id = p_id;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Remove a conta inteira (login + perfil + chamados do aluno).
-- Depois disso o e-mail fica livre para um cadastro novo.
-- ---------------------------------------------------------------------
create or replace function public.admin_remover_aluno(p_id uuid)
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  perform public.exigir_admin();

  if p_id = auth.uid() then
    raise exception 'Você não pode remover a sua própria conta.';
  end if;

  delete from public.fila_usuarios where id = p_id;
  delete from auth.users where id = p_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Turmas: listar (com inativas), criar/editar e excluir
-- ---------------------------------------------------------------------
create or replace function public.admin_listar_turmas()
returns table (id bigint, nome text, apelido text, ativa boolean, alunos bigint, aulas bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  return query
  select t.id, t.nome::text, t.apelido::text, t.ativa,
         (select count(*) from public.fila_usuarios u where u.turma_id = t.id and u.papel = 'aluno'),
         (select count(*) from public.fila_sessoes s where s.turma_id = t.id)
  from public.fila_turmas t
  order by t.ativa desc, t.apelido;
end;
$$;

-- p_id nulo = turma nova
create or replace function public.admin_salvar_turma(
  p_id       bigint,
  p_nome     text,
  p_apelido  text,
  p_ativa    boolean default true
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Dê um nome para a turma.';
  end if;
  if exists (select 1 from public.fila_turmas
             where lower(nome) = lower(trim(p_nome)) and id is distinct from p_id) then
    raise exception 'Já existe uma turma com esse nome.';
  end if;

  if p_id is null then
    insert into public.fila_turmas (nome, apelido, ativa)
    values (trim(p_nome), coalesce(nullif(trim(p_apelido), ''), trim(p_nome)), coalesce(p_ativa, true));
  else
    update public.fila_turmas
       set nome = trim(p_nome),
           apelido = coalesce(nullif(trim(p_apelido), ''), trim(p_nome)),
           ativa = coalesce(p_ativa, true)
     where id = p_id;
  end if;
end;
$$;

-- Só exclui turma vazia (sem alunos e sem aulas). Senão, desative.
create or replace function public.admin_excluir_turma(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_admin();

  if exists (select 1 from public.fila_usuarios where turma_id = p_id) then
    raise exception 'A turma tem alunos. Mude os alunos de turma ou apenas desative a turma.';
  end if;
  if exists (select 1 from public.fila_sessoes where turma_id = p_id) then
    raise exception 'A turma já teve aulas com fila. Desative em vez de excluir, para manter o histórico.';
  end if;

  delete from public.fila_turmas where id = p_id;
end;
$$;


-- ---------------------------------------------------------------------
-- Permissões: só usuários logados chamam (e a função confere se é admin)
-- ---------------------------------------------------------------------
revoke execute on function
  public.admin_listar_alunos(), public.admin_salvar_aluno(uuid, text, text, bigint, text),
  public.admin_remover_aluno(uuid), public.admin_listar_turmas(),
  public.admin_salvar_turma(bigint, text, text, boolean), public.admin_excluir_turma(bigint)
  from public, anon;
grant execute on function
  public.admin_listar_alunos(), public.admin_salvar_aluno(uuid, text, text, bigint, text),
  public.admin_remover_aluno(uuid), public.admin_listar_turmas(),
  public.admin_salvar_turma(bigint, text, text, boolean), public.admin_excluir_turma(bigint)
  to authenticated;
