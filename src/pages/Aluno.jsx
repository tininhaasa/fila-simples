import { useEffect, useState } from 'react'
import {
  abrirChamado,
  buscarMeuChamado,
  cancelarChamado,
  resolviSozinho,
  responderChamado,
} from '../api'
import { tempoDesde, useAgora, useFila } from '../useFila'
import { BotaoAcao, Erro, Status } from '../components/ui'

const ABERTOS = ['aguardando', 'em_atendimento', 'respondido']

export default function Aluno({ perfil }) {
  const { sessoes, chamados, carregando, erro, recarregar, versao } = useFila()
  const agora = useAgora()
  const [meuChamado, setMeuChamado] = useState(null)

  const minhaSessao = sessoes.find((s) => s.turma_id === perfil.turma_id)
  const filaDaTurma = chamados.filter((c) => c.sessao_id === minhaSessao?.id)

  // Busca o meu chamado de novo sempre que a fila muda
  useEffect(() => {
    if (!minhaSessao) {
      setMeuChamado(null)
      return
    }
    buscarMeuChamado(perfil.id, minhaSessao.id).then(setMeuChamado).catch(() => {})
  }, [versao, minhaSessao?.id, perfil.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando) return <p className="muted">Carregando…</p>

  if (!minhaSessao) {
    return (
      <div className="card vazio">
        <h2>A fila da sua turma está fechada</h2>
        <p className="muted">Quando a professora abrir, ela aparece aqui sozinha.</p>
        <Erro>{erro}</Erro>
      </div>
    )
  }

  const temAberto = meuChamado && ABERTOS.includes(meuChamado.status)
  const aguardando = filaDaTurma.filter((c) => c.status !== 'em_atendimento')
  const posicao = temAberto ? aguardando.findIndex((c) => c.id === meuChamado.id) + 1 : 0
  const paraAjudar = filaDaTurma.filter((c) => c.aluno_id !== perfil.id)

  return (
    <div className="grade-aluno">
      <section>
        <h2 className="titulo-secao">
          Minha dúvida <small>{minhaSessao.turma?.apelido}{minhaSessao.titulo ? ` · ${minhaSessao.titulo}` : ''}</small>
        </h2>

        {temAberto ? (
          <MeuChamado chamado={meuChamado} posicao={posicao} agora={agora} onMudou={recarregar} />
        ) : (
          <>
            {meuChamado?.status === 'resolvido' && <UltimoResolvido chamado={meuChamado} />}
            <NovaDuvida onEnviada={recarregar} />
          </>
        )}
      </section>

      <section>
        <h2 className="titulo-secao">
          Ajudar colegas <small>{paraAjudar.length} na fila</small>
        </h2>
        {paraAjudar.length === 0 && <p className="card vazio muted">Ninguém esperando agora.</p>}
        {paraAjudar.map((c) => (
          <ChamadoColega key={c.id} chamado={c} agora={agora} onMudou={recarregar} />
        ))}
      </section>
    </div>
  )
}

function NovaDuvida({ onEnviada }) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await abrirChamado(texto)
      setTexto('')
      onEnviada()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="card" onSubmit={enviar}>
      <label>
        Qual é a sua dúvida?
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={300}
          rows={4}
          placeholder="Ex.: meu botão não chama a função no clique"
          required
        />
      </label>
      <div className="linha-fim">
        <small className="muted">{texto.length}/300</small>
        <button className="btn laranja" disabled={enviando}>{enviando ? '…' : 'Entrar na fila'}</button>
      </div>
      <Erro>{erro}</Erro>
    </form>
  )
}

function MeuChamado({ chamado, posicao, agora, onMudou }) {
  const [erro, setErro] = useState('')

  return (
    <div className={`card destaque d-${chamado.status}`}>
      <div className="linha-fim">
        <Status status={chamado.status} />
        <small className="muted">{tempoDesde(chamado.criado_em, agora)}</small>
      </div>

      {chamado.status === 'aguardando' && <p className="posicao">Você é o nº <strong>{posicao}</strong> da fila</p>}
      {chamado.status === 'em_atendimento' && <p className="posicao">A professora está vindo te atender 🙋‍♀️</p>}

      <p className="pergunta">{chamado.pergunta}</p>

      {chamado.status === 'respondido' && (
        <div className="resposta">
          <strong>{chamado.ajudante?.nome_completo} respondeu:</strong>
          <p>{chamado.resposta}</p>
          <small className="muted">Esperando a professora aprovar.</small>
        </div>
      )}

      <div className="acoes">
        {chamado.status !== 'em_atendimento' && (
          <BotaoAcao className="btn" acao={async () => { await resolviSozinho(chamado.id); onMudou() }} onErro={setErro}>
            Resolvi sozinho
          </BotaoAcao>
        )}
        <BotaoAcao
          className="btn fantasma"
          confirmar="Cancelar o seu chamado?"
          acao={async () => { await cancelarChamado(chamado.id); onMudou() }}
          onErro={setErro}
        >
          Cancelar
        </BotaoAcao>
      </div>
      <Erro>{erro}</Erro>
    </div>
  )
}

function UltimoResolvido({ chamado }) {
  const quem = {
    professora: 'pela professora',
    colega: `com a ajuda de ${chamado.ajudante?.nome_completo || 'um colega'}`,
    sozinho: 'por você mesmo 💪',
  }[chamado.resolvido_por]

  return (
    <div className="card resolvido">
      <p><Status status="resolvido" /> <small className="muted">Sua última dúvida foi resolvida {quem}.</small></p>
      <p className="pergunta pequena">{chamado.pergunta}</p>
      {chamado.resolvido_por === 'colega' && chamado.resposta && (
        <div className="resposta"><p>{chamado.resposta}</p></div>
      )}
    </div>
  )
}

function ChamadoColega({ chamado, agora, onMudou }) {
  const [abrindo, setAbrindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')

  async function enviar() {
    await responderChamado(chamado.id, texto)
    setAbrindo(false)
    setTexto('')
    onMudou()
  }

  return (
    <div className="card chamado">
      <div className="linha-fim">
        <strong>{chamado.aluno?.nome_completo}</strong>
        <small className="muted">{tempoDesde(chamado.criado_em, agora)}</small>
      </div>
      <p className="pergunta">{chamado.pergunta}</p>

      {chamado.status === 'aguardando' && !abrindo && (
        <button className="btn" onClick={() => setAbrindo(true)}>Eu sei responder</button>
      )}
      {chamado.status !== 'aguardando' && <Status status={chamado.status} />}

      {abrindo && (
        <div className="responder">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Explique como resolver. A professora vai aprovar a sua resposta."
            autoFocus
          />
          <div className="acoes">
            <BotaoAcao className="btn primario" acao={enviar} onErro={setErro}>Enviar resposta</BotaoAcao>
            <button className="btn fantasma" onClick={() => setAbrindo(false)}>Voltar</button>
          </div>
        </div>
      )}
      <Erro>{erro}</Erro>
    </div>
  )
}
