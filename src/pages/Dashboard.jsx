import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminExcluirTurma,
  adminListarAlunos,
  adminListarTurmas,
  adminRemoverAluno,
  adminSalvarAluno,
  adminSalvarTurma,
  dashTurmas,
} from '../api'
import { formatarSegundos } from '../useFila'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPen, faPlus, faTrashCan, faTriangleExclamation, faUsersGear, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { BotaoAcao, Erro, Modal } from '../components/ui'

const PARTES = [
  { campo: 'pela_professora', rotulo: 'Professora', cor: 'var(--g-professora)' },
  { campo: 'por_colegas', rotulo: 'Colegas', cor: 'var(--g-colegas)' },
  { campo: 'sozinhos', rotulo: 'Sozinhos', cor: 'var(--g-sozinhos)' },
  { campo: 'cancelados', rotulo: 'Cancelados', cor: 'var(--g-cancelados)' },
]

export default function Dashboard() {
  const [resumo, setResumo] = useState([])
  const [alunos, setAlunos] = useState([])
  const [turmas, setTurmas] = useState([])
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const [filtroTurma, setFiltroTurma] = useState('')
  const [filtroPapel, setFiltroPapel] = useState('aluno')
  const [busca, setBusca] = useState('')

  const [editando, setEditando] = useState(null)
  const [gerenciarTurmas, setGerenciarTurmas] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [r, a, t] = await Promise.all([dashTurmas(), adminListarAlunos(), adminListarTurmas()])
      setResumo(r)
      setAlunos(a)
      setTurmas(t)
      setErro('')
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const total = (campo) => resumo.reduce((s, t) => s + Number(t[campo] || 0), 0)
  const semTurma = alunos.filter((a) => a.papel === 'aluno' && !a.turma_id).length

  if (carregando) return <p className="muted">Carregando…</p>

  return (
    <div className="pilha">
      <Erro>{erro}</Erro>

      <div className="kpis">
        <Numero rotulo="Alunos" valor={total('alunos')} dica={`em ${turmas.filter((t) => t.ativa).length} turmas ativas`} cor="var(--azul)" />
        <Numero rotulo="Aulas com fila" valor={total('aulas')} dica="filas já abertas" cor="var(--text-4)" />
        <Numero rotulo="Chamados" valor={total('chamados')} dica={`${total('pela_professora')} atendidos pela professora`} cor="var(--g-sozinhos)" />
        <Numero rotulo="Resolvidos por colegas" valor={total('por_colegas')} dica="respostas aprovadas" cor="var(--laranja)" />
      </div>

      <section className="card sem-pad">
        <div className="barra-titulo">
          <h2>Turmas</h2>
          <Legenda />
          <button className="btn" onClick={() => setGerenciarTurmas(true)}><FontAwesomeIcon icon={faUsersGear} /> Gerenciar turmas</button>
        </div>
        <div className="grade-turmas">
          {resumo.map((t) => (
            <button
              key={t.turma_id}
              className={`turma-card ${String(filtroTurma) === String(t.turma_id) ? 'on' : ''}`}
              onClick={() => setFiltroTurma(String(filtroTurma) === String(t.turma_id) ? '' : String(t.turma_id))}
              title="Clique para ver só os alunos desta turma"
            >
              <div className="linha-fim">
                <strong>{t.turma}</strong>
                <small className="muted">{t.alunos} alunos</small>
              </div>
              <Barra dados={t} />
              <small className="muted">
                {t.aulas} aulas · {t.chamados} chamados · espera média {formatarSegundos(t.espera_media_seg)}
              </small>
            </button>
          ))}
        </div>
      </section>

      <TabelaAlunos
        alunos={alunos}
        turmas={turmas}
        filtroTurma={filtroTurma}
        setFiltroTurma={setFiltroTurma}
        filtroPapel={filtroPapel}
        setFiltroPapel={setFiltroPapel}
        busca={busca}
        setBusca={setBusca}
        semTurma={semTurma}
        onEditar={setEditando}
      />

      {editando && (
        <ModalAluno
          aluno={editando}
          turmas={turmas}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}

      {gerenciarTurmas && (
        <ModalTurmas turmas={turmas} onFechar={() => setGerenciarTurmas(false)} onMudou={carregar} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Tabela de alunos com filtros
// ---------------------------------------------------------------------
const COLUNAS = [
  { campo: 'nome_completo', rotulo: 'Aluno' },
  { campo: 'matricula', rotulo: 'Matrícula' },
  { campo: 'turma', rotulo: 'Turma' },
  { campo: 'chamados', rotulo: 'Chamados', num: true },
  { campo: 'ajudas', rotulo: 'Ajudou', num: true },
  { campo: 'sozinho', rotulo: 'Sozinho', num: true },
  { campo: 'ultimo_acesso', rotulo: 'Último acesso' },
]

function TabelaAlunos({
  alunos, turmas, filtroTurma, setFiltroTurma, filtroPapel, setFiltroPapel,
  busca, setBusca, semTurma, onEditar,
}) {
  const [ordem, setOrdem] = useState({ campo: 'nome_completo', desc: false })

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = alunos.filter((a) => {
      if (filtroPapel && a.papel !== filtroPapel) return false
      if (filtroTurma === 'sem') { if (a.turma_id) return false }
      else if (filtroTurma && String(a.turma_id) !== filtroTurma) return false
      if (termo) {
        const alvo = `${a.nome_completo} ${a.matricula} ${a.email || ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
    lista.sort((a, b) => {
      const x = a[ordem.campo] ?? ''
      const y = b[ordem.campo] ?? ''
      const r = typeof x === 'number' || COLUNAS.find((c) => c.campo === ordem.campo)?.num
        ? Number(x) - Number(y)
        : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })
      return ordem.desc ? -r : r
    })
    return lista
  }, [alunos, filtroTurma, filtroPapel, busca, ordem])

  function ordenar(campo) {
    const num = COLUNAS.find((c) => c.campo === campo)?.num
    setOrdem((o) => ({ campo, desc: o.campo === campo ? !o.desc : Boolean(num) }))
  }

  const temFiltro = filtroTurma || busca || filtroPapel !== 'aluno'

  return (
    <section className="card sem-pad">
      <div className="filtros">
        <label>
          Turma
          <select value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
            <option value="">Todas</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>{t.apelido}{t.ativa ? '' : ' (inativa)'}</option>
            ))}
            <option value="sem">Sem turma</option>
          </select>
        </label>
        <label>
          Mostrar
          <select value={filtroPapel} onChange={(e) => setFiltroPapel(e.target.value)}>
            <option value="aluno">Alunos</option>
            <option value="admin">Professoras</option>
            <option value="">Todos</option>
          </select>
        </label>
        <label className="busca-campo">
          Buscar
          <span className="campo-icone">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, matrícula ou e-mail…"
            />
          </span>
        </label>
        {temFiltro && (
          <button className="btn" onClick={() => { setFiltroTurma(''); setBusca(''); setFiltroPapel('aluno') }}>
            Limpar filtros
          </button>
        )}
      </div>

      <div className="barra-contagem">
        <span><b>{filtrados.length}</b> exibido(s) de <b>{alunos.length}</b> cadastrados</span>
        {semTurma > 0 && filtroTurma !== 'sem' && (
          <button className="aviso-link" onClick={() => setFiltroTurma('sem')}>
            <FontAwesomeIcon icon={faTriangleExclamation} /> {semTurma} aluno(s) sem turma
          </button>
        )}
      </div>

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              {COLUNAS.map((c) => (
                <th key={c.campo} className={c.num ? 'num' : ''}>
                  <button className={ordem.campo === c.campo ? 'on' : ''} onClick={() => ordenar(c.campo)}>
                    {c.rotulo} {ordem.campo === c.campo ? (ordem.desc ? '↓' : '↑') : ''}
                  </button>
                </th>
              ))}
              <th className="acao-col"><span className="rotulo">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="pessoa">
                    {a.nome_completo}
                    {a.papel === 'admin' && <span className="status s-admin">Professora</span>}
                    <small>{a.email || '—'}</small>
                  </div>
                </td>
                <td className="mono">{a.matricula}</td>
                <td className="nowrap">{a.turma || <span className="status s-cancelado">Sem turma</span>}</td>
                <td className="num">{a.chamados}</td>
                <td className="num">{a.ajudas}</td>
                <td className="num">{a.sozinho}</td>
                <td className="data">{formatarData(a.ultimo_acesso)}</td>
                <td className="acao-col">
                  <button className="btn-icone" onClick={() => onEditar(a)} title="Editar cadastro" aria-label={`Editar ${a.nome_completo}`}>
                    <FontAwesomeIcon icon={faPen} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && <p className="vazio-tabela muted">Nenhum cadastro com esses filtros.</p>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------
// Editar um aluno
// ---------------------------------------------------------------------
function ModalAluno({ aluno, turmas, onFechar, onSalvo }) {
  const [nome, setNome] = useState(aluno.nome_completo)
  const [matricula, setMatricula] = useState(aluno.matricula)
  const [turmaId, setTurmaId] = useState(aluno.turma_id ? String(aluno.turma_id) : '')
  const [papel, setPapel] = useState(aluno.papel)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await adminSalvarAluno({ id: aluno.id, nome, matricula, turmaId, papel })
      onSalvo()
    } catch (e) {
      setErro(e.message)
      setSalvando(false)
    }
  }

  return (
    <Modal titulo="Editar cadastro" onFechar={onFechar}>
      <form className="form-modal" onSubmit={salvar}>
        <label>
          E-mail de login
          <input value={aluno.email || ''} disabled />
        </label>
        <label>
          Nome completo
          <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={150} autoFocus />
        </label>
        <div className="duas-colunas">
          <label>
            Matrícula
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} required maxLength={30} />
          </label>
          <label>
            Turma
            <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
              <option value="">Sem turma</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>{t.apelido}{t.ativa ? '' : ' (inativa)'}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Papel
          <select value={papel} onChange={(e) => setPapel(e.target.value)}>
            <option value="aluno">Aluno</option>
            <option value="admin">Professora (acesso ao painel)</option>
          </select>
        </label>

        <div className="numeros-aluno">
          <span><b>{aluno.chamados}</b> chamados</span>
          <span><b>{aluno.ajudas}</b> ajudas aprovadas</span>
          <span><b>{aluno.sozinho}</b> resolveu sozinho</span>
        </div>

        <Erro>{erro}</Erro>

        <div className="rodape-modal">
          <BotaoAcao
            className="btn perigo"
            confirmar={`Remover a conta de ${aluno.nome_completo}?\n\nO login e todos os chamados dessa pessoa serão apagados. Isso não pode ser desfeito.`}
            acao={async () => { await adminRemoverAluno(aluno.id); onSalvo() }}
            onErro={setErro}
          >
            Remover conta
          </BotaoAcao>
          <span className="espaco" />
          <button type="button" className="btn fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando}>{salvando ? '…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------
// Gerenciar turmas
// ---------------------------------------------------------------------
function ModalTurmas({ turmas, onFechar, onMudou }) {
  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [erro, setErro] = useState('')

  return (
    <Modal titulo="Turmas" onFechar={onFechar} largo>
      <div className="nova-turma">
        <label>
          Nome da turma
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Técnico em Mecânica 2026/2" maxLength={100} />
        </label>
        <label>
          Apelido (aparece nas telas)
          <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Ex.: MEC 26/2" maxLength={50} />
        </label>
        <BotaoAcao
          className="btn laranja"
          acao={async () => {
            await adminSalvarTurma({ nome, apelido })
            setNome('')
            setApelido('')
            setErro('')
            onMudou()
          }}
          onErro={setErro}
        >
          <FontAwesomeIcon icon={faPlus} /> Criar turma
        </BotaoAcao>
      </div>
      <Erro>{erro}</Erro>

      <div className="lista-turmas">
        {turmas.map((t) => (
          <LinhaTurma key={t.id} turma={t} onMudou={onMudou} />
        ))}
      </div>
    </Modal>
  )
}

function LinhaTurma({ turma, onMudou }) {
  const [nome, setNome] = useState(turma.nome)
  const [apelido, setApelido] = useState(turma.apelido)
  const [erro, setErro] = useState('')
  const mudou = nome !== turma.nome || apelido !== turma.apelido

  useEffect(() => {
    setNome(turma.nome)
    setApelido(turma.apelido)
  }, [turma.nome, turma.apelido])

  const salvar = (ativa = turma.ativa) => async () => {
    await adminSalvarTurma({ id: turma.id, nome, apelido, ativa })
    setErro('')
    onMudou()
  }

  return (
    <div className={`linha-turma ${turma.ativa ? '' : 'inativa'}`}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome da turma" />
      <input value={apelido} onChange={(e) => setApelido(e.target.value)} aria-label="Apelido" />
      <small className="muted">{turma.alunos} alunos · {turma.aulas} aulas</small>
      <div className="acoes">
        {mudou && <BotaoAcao className="btn primario" acao={salvar()} onErro={setErro}>Salvar</BotaoAcao>}
        <BotaoAcao className="btn" acao={salvar(!turma.ativa)} onErro={setErro}>
          {turma.ativa ? 'Desativar' : 'Reativar'}
        </BotaoAcao>
        <BotaoAcao
          className="btn-icone perigo"
          confirmar={`Excluir a turma ${turma.apelido}?`}
          acao={async () => { await adminExcluirTurma(turma.id); onMudou() }}
          onErro={setErro}
        >
          <FontAwesomeIcon icon={faTrashCan} />
        </BotaoAcao>
      </div>
      {erro && <Erro>{erro}</Erro>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Peças pequenas
// ---------------------------------------------------------------------
function Numero({ rotulo, valor, dica, cor }) {
  return (
    <div className="kpi" style={{ '--c': cor }}>
      <div className="l">{rotulo}</div>
      <div className="v">{valor}</div>
      <div className="h">{dica}</div>
    </div>
  )
}

function Legenda() {
  return (
    <div className="legenda">
      {PARTES.map((p) => (
        <span key={p.campo}><i style={{ background: p.cor }} />{p.rotulo}</span>
      ))}
    </div>
  )
}

function Barra({ dados }) {
  const soma = PARTES.reduce((s, p) => s + Number(dados[p.campo] || 0), 0)
  if (!soma) return <div className="barra vazia"><small className="muted">sem chamados ainda</small></div>
  return (
    <div className="barra" title={PARTES.map((p) => `${p.rotulo}: ${dados[p.campo]}`).join(' · ')}>
      {PARTES.map((p) =>
        Number(dados[p.campo]) > 0 ? (
          <div key={p.campo} style={{ flexGrow: Number(dados[p.campo]), background: p.cor }}>
            {dados[p.campo]}
          </div>
        ) : null
      )}
    </div>
  )
}

function formatarData(iso) {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
