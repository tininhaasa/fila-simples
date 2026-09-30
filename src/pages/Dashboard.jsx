import { useEffect, useMemo, useState } from 'react'
import { dashAlunos, dashTurmas } from '../api'
import { formatarSegundos } from '../useFila'
import { Erro } from '../components/ui'

const PARTES = [
  { campo: 'pela_professora', rotulo: 'Professora', cor: 'var(--g-professora)' },
  { campo: 'por_colegas', rotulo: 'Colegas', cor: 'var(--g-colegas)' },
  { campo: 'sozinhos', rotulo: 'Sozinhos', cor: 'var(--g-sozinhos)' },
  { campo: 'cancelados', rotulo: 'Cancelados', cor: 'var(--g-cancelados)' },
]

export default function Dashboard() {
  const [turmas, setTurmas] = useState([])
  const [aberta, setAberta] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    dashTurmas().then(setTurmas).catch((e) => setErro(e.message))
  }, [])

  const total = (campo) => turmas.reduce((s, t) => s + Number(t[campo] || 0), 0)

  return (
    <div className="pilha">
      <Erro>{erro}</Erro>

      <div className="kpis">
        <Numero rotulo="Alunos" valor={total('alunos')} dica={`em ${turmas.length} turmas`} cor="var(--azul)" />
        <Numero rotulo="Aulas com fila" valor={total('aulas')} dica="filas abertas" cor="var(--text-4)" />
        <Numero rotulo="Chamados" valor={total('chamados')} dica={`${total('pela_professora')} atendidos pela professora`} cor="var(--g-sozinhos)" />
        <Numero rotulo="Resolvidos por colegas" valor={total('por_colegas')} dica="respostas aprovadas" cor="var(--laranja)" />
      </div>

      <Legenda />

      {turmas.map((t) => (
        <div key={t.turma_id} className={`card turma-dash ${aberta === t.turma_id ? 'aberta' : ''}`}>
          <button className="turma-linha" onClick={() => setAberta(aberta === t.turma_id ? null : t.turma_id)}>
            <div>
              <h4>{t.turma}</h4>
              <small className="muted">
                {t.alunos} alunos · {t.aulas} aulas · {t.chamados} chamados · espera média {formatarSegundos(t.espera_media_seg)}
              </small>
            </div>
            <Barra dados={t} />
            <span className="seta">{aberta === t.turma_id ? '▲' : '▼'}</span>
          </button>
          {aberta === t.turma_id && <TabelaAlunos turmaId={t.turma_id} />}
        </div>
      ))}
    </div>
  )
}

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
      <span className="rotulo">Como os chamados terminaram</span>
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

const COLUNAS = [
  { campo: 'nome', rotulo: 'Aluno' },
  { campo: 'chamados', rotulo: 'Chamados' },
  { campo: 'ajudas_aprovadas', rotulo: 'Ajudou colegas' },
  { campo: 'resolveu_sozinho', rotulo: 'Resolveu sozinho' },
]

function TabelaAlunos({ turmaId }) {
  const [alunos, setAlunos] = useState([])
  const [ordem, setOrdem] = useState({ campo: 'chamados', desc: true })
  const [erro, setErro] = useState('')

  useEffect(() => {
    dashAlunos(turmaId).then(setAlunos).catch((e) => setErro(e.message))
  }, [turmaId])

  const ordenados = useMemo(() => {
    const copia = [...alunos]
    copia.sort((a, b) => {
      const x = a[ordem.campo]
      const y = b[ordem.campo]
      const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : Number(x) - Number(y)
      return ordem.desc ? -r : r
    })
    return copia
  }, [alunos, ordem])

  function ordenar(campo) {
    setOrdem((o) => ({ campo, desc: o.campo === campo ? !o.desc : campo !== 'nome' }))
  }

  if (erro) return <Erro>{erro}</Erro>
  if (!alunos.length) return <p className="muted pequeno">Nenhum aluno cadastrado nesta turma.</p>

  return (
    <table className="tabela">
      <thead>
        <tr>
          {COLUNAS.map((c) => (
            <th key={c.campo}>
              <button className={ordem.campo === c.campo ? 'on' : ''} onClick={() => ordenar(c.campo)}>
                {c.rotulo} {ordem.campo === c.campo ? (ordem.desc ? '↓' : '↑') : ''}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ordenados.map((a) => (
          <tr key={a.aluno_id}>
            <td>{a.nome}</td>
            <td>{a.chamados}</td>
            <td>{a.ajudas_aprovadas}</td>
            <td>{a.resolveu_sozinho}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
