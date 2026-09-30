// Todas as conversas com o Supabase ficam aqui.
// As ações (abrir, responder, aprovar...) são funções no banco (RPC):
// o banco confere quem está chamando e se pode fazer aquilo.
import { supabase } from './lib/supabase'

async function rpc(nome, params) {
  const { data, error } = await supabase.rpc(nome, params)
  if (error) throw new Error(error.message)
  return data
}

async function consulta(query) {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

// ---------- login ----------
export async function entrar(email, senha) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(traduzirErroLogin(error.message))
}

export async function criarConta(email, senha) {
  const { data, error } = await supabase.auth.signUp({ email, password: senha })
  if (error) throw new Error(traduzirErroLogin(error.message))
  return data
}

export function sair() {
  return supabase.auth.signOut()
}

function traduzirErroLogin(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('already registered')) return 'Este e-mail já tem conta. Use "Entrar".'
  if (msg.includes('at least 6')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (msg.includes('Email not confirmed')) return 'Confirme o seu e-mail antes de entrar.'
  return msg
}

// ---------- perfil e turmas ----------
export function buscarPerfil(userId) {
  return consulta(
    supabase
      .from('fila_usuarios')
      .select('*, turma:fila_turmas(id, apelido)')
      .eq('id', userId)
      .maybeSingle()
  )
}

export function criarPerfil({ id, nome, matricula, turmaId }) {
  return consulta(
    supabase.from('fila_usuarios').insert({
      id,
      nome_completo: nome.trim(),
      matricula: matricula.trim(),
      turma_id: Number(turmaId),
    })
  )
}

export function listarTurmas() {
  return consulta(
    supabase.from('fila_turmas').select('id, apelido').eq('ativa', true).order('apelido')
  )
}

// ---------- fila ----------
const CAMPOS_CHAMADO = `
  *,
  aluno:fila_usuarios!chamados_aluno_id_fkey(nome_completo),
  ajudante:fila_usuarios!chamados_ajudante_id_fkey(nome_completo)
`

export function listarSessoesAtivas() {
  return consulta(
    supabase
      .from('fila_sessoes')
      .select('*, turma:fila_turmas(id, apelido)')
      .eq('ativa', true)
      .order('iniciada_em')
  )
}

export function listarChamadosAbertos(sessaoIds) {
  if (!sessaoIds.length) return []
  return consulta(
    supabase
      .from('chamados')
      .select(CAMPOS_CHAMADO)
      .in('sessao_id', sessaoIds)
      .in('status', ['aguardando', 'em_atendimento', 'respondido'])
      .order('criado_em')
  )
}

// Último chamado do aluno na sessão atual (mesmo se já resolvido,
// para ele ver quem ajudou e a resposta aprovada)
export async function buscarMeuChamado(alunoId, sessaoId) {
  const lista = await consulta(
    supabase
      .from('chamados')
      .select(CAMPOS_CHAMADO)
      .eq('aluno_id', alunoId)
      .eq('sessao_id', sessaoId)
      .order('criado_em', { ascending: false })
      .limit(1)
  )
  return lista[0] || null
}

// ---------- ações do aluno ----------
export const abrirChamado = (pergunta) => rpc('abrir_chamado', { p_pergunta: pergunta })
export const cancelarChamado = (id) => rpc('cancelar_chamado', { p_id: id })
export const resolviSozinho = (id) => rpc('resolvi_sozinho', { p_id: id })
export const responderChamado = (id, resposta) =>
  rpc('responder_chamado', { p_id: id, p_resposta: resposta })

// ---------- ações da professora ----------
export const abrirSessao = (turmaId, titulo) =>
  rpc('abrir_sessao', { p_turma_id: Number(turmaId), p_titulo: titulo })
export const encerrarSessao = (id) => rpc('encerrar_sessao', { p_sessao_id: id })
export const atenderChamado = (id) => rpc('atender_chamado', { p_id: id })
export const finalizarChamado = (id) => rpc('finalizar_chamado', { p_id: id })
export const aprovarResposta = (id) => rpc('aprovar_resposta', { p_id: id })
export const recusarResposta = (id) => rpc('recusar_resposta', { p_id: id })

// ---------- dashboard ----------
export const dashTurmas = () =>
  consulta(supabase.from('dash_turmas').select('*').order('turma'))
export const dashAlunos = (turmaId) =>
  consulta(supabase.from('dash_alunos').select('*').eq('turma_id', turmaId).order('nome'))
