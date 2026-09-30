import { useEffect, useState } from 'react'
import {
  abrirSessao,
  aprovarResposta,
  atenderChamado,
  cancelarChamado,
  encerrarSessao,
  finalizarChamado,
  listarTurmas,
  recusarResposta,
} from '../api'
import { tempoDesde, useAgora, useFila } from '../useFila'
import { BotaoAcao, Erro } from '../components/ui'

export default function Professora() {
  const { sessoes, chamados, carregando, erro, recarregar } = useFila()
  const agora = useAgora()

  if (carregando) return <p className="muted">Carregando…</p>

  return (
    <div className="pilha">
      <Erro>{erro}</Erro>
      <AbrirFila sessoes={sessoes} onAberta={recarregar} />

      {sessoes.length === 0 && (
        <div className="card vazio">
          <h2>Nenhuma fila aberta</h2>
          <p className="muted">Escolha uma turma acima para abrir a fila da aula.</p>
        </div>
      )}

      {sessoes.map((s) => (
        <FilaDaTurma
          key={s.id}
          sessao={s}
          chamados={chamados.filter((c) => c.sessao_id === s.id)}
          agora={agora}
          onMudou={recarregar}
        />
      ))}
    </div>
  )
}

function AbrirFila({ sessoes, onAberta }) {
  const [turmas, setTurmas] = useState([])
  const [turmaId, setTurmaId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    listarTurmas().then(setTurmas).catch((e) => setErro(e.message))
  }, [])

  const abertas = new Set(sessoes.map((s) => s.turma_id))
  const disponiveis = turmas.filter((t) => !abertas.has(t.id))

  if (turmas.length && !disponiveis.length) return null

  return (
    <div className="card abrir-fila">
      <label>
        Turma
        <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
          <option value="">Escolha…</option>
          {disponiveis.map((t) => <option key={t.id} value={t.id}>{t.apelido}</option>)}
        </select>
      </label>
      <label>
        Assunto da aula
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Opcional — ex.: React, useEffect" maxLength={150} />
      </label>
      <BotaoAcao
        className="btn laranja"
        acao={async () => {
          if (!turmaId) throw new Error('Escolha a turma.')
          await abrirSessao(turmaId, titulo)
          setTurmaId('')
          setTitulo('')
          setErro('')
          onAberta()
        }}
        onErro={setErro}
      >
        Abrir fila
      </BotaoAcao>
      <Erro>{erro}</Erro>
    </div>
  )
}

function FilaDaTurma({ sessao, chamados, agora, onMudou }) {
  const [erro, setErro] = useState('')
  const exec = (fn) => async () => { await fn(); setErro(''); onMudou() }

  const emAtendimento = chamados.filter((c) => c.status === 'em_atendimento')
  const paraAprovar = chamados.filter((c) => c.status === 'respondido')
  const naFila = chamados.filter((c) => c.status === 'aguardando')

  return (
    <section className="card turma">
      <header className="linha-fim">
        <div>
          <h2>{sessao.turma?.apelido}</h2>
          <small className="muted">
            {sessao.titulo ? `${sessao.titulo} · ` : ''}aberta {tempoDesde(sessao.iniciada_em, agora)}
          </small>
        </div>
        <BotaoAcao
          className="btn perigo"
          confirmar={`Encerrar a fila de ${sessao.turma?.apelido}? Chamados abertos serão cancelados.`}
          acao={exec(() => encerrarSessao(sessao.id))}
          onErro={setErro}
        >
          Encerrar fila
        </BotaoAcao>
      </header>
      <Erro>{erro}</Erro>

      <div className="colunas">
        <div>
          <h3>Atendendo agora</h3>
          {emAtendimento.length === 0 && <p className="muted pequeno">—</p>}
          {emAtendimento.map((c) => (
            <div key={c.id} className="item d-em_atendimento">
              <ItemTopo c={c} agora={agora} campo="atendimento_em" />
              <p className="pergunta">{c.pergunta}</p>
              <div className="acoes">
                <BotaoAcao className="btn primario" acao={exec(() => finalizarChamado(c.id))} onErro={setErro}>
                  Resolvido ✓
                </BotaoAcao>
              </div>
            </div>
          ))}

          <h3>Aprovar respostas {paraAprovar.length > 0 && <span className="contador">{paraAprovar.length}</span>}</h3>
          {paraAprovar.length === 0 && <p className="muted pequeno">Nenhuma resposta de colega esperando.</p>}
          {paraAprovar.map((c) => (
            <div key={c.id} className="item d-respondido">
              <ItemTopo c={c} agora={agora} />
              <p className="pergunta">{c.pergunta}</p>
              <div className="resposta">
                <strong>{c.ajudante?.nome_completo} respondeu:</strong>
                <p>{c.resposta}</p>
              </div>
              <div className="acoes">
                <BotaoAcao className="btn primario" acao={exec(() => aprovarResposta(c.id))} onErro={setErro}>
                  Aprovar
                </BotaoAcao>
                <BotaoAcao className="btn" acao={exec(() => recusarResposta(c.id))} onErro={setErro}>
                  Recusar
                </BotaoAcao>
                <BotaoAcao className="btn fantasma" acao={exec(() => atenderChamado(c.id))} onErro={setErro}>
                  Eu atendo
                </BotaoAcao>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h3>Na fila {naFila.length > 0 && <span className="contador">{naFila.length}</span>}</h3>
          {naFila.length === 0 && <p className="muted pequeno">Ninguém esperando.</p>}
          <ol className="lista-fila">
            {naFila.map((c) => (
              <li key={c.id} className="item">
                <ItemTopo c={c} agora={agora} />
                <p className="pergunta">{c.pergunta}</p>
                <div className="acoes">
                  <BotaoAcao className="btn primario" acao={exec(() => atenderChamado(c.id))} onErro={setErro}>
                    Atender
                  </BotaoAcao>
                  <BotaoAcao
                    className="btn fantasma"
                    confirmar="Cancelar este chamado?"
                    acao={exec(() => cancelarChamado(c.id))}
                    onErro={setErro}
                  >
                    Cancelar
                  </BotaoAcao>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function ItemTopo({ c, agora, campo = 'criado_em' }) {
  return (
    <div className="linha-fim">
      <strong>{c.aluno?.nome_completo}</strong>
      <small className="muted">{tempoDesde(c[campo] || c.criado_em, agora)}</small>
    </div>
  )
}
