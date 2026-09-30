import { useEffect, useState } from 'react'
import { criarPerfil, listarTurmas, sair } from '../api'
import { Erro } from '../components/ui'
import { BotaoTema } from '../components/Topo'

export default function CompletarPerfil({ userId, email, onPronto }) {
  const [turmas, setTurmas] = useState([])
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    listarTurmas().then(setTurmas).catch((e) => setErro(e.message))
  }, [])

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await criarPerfil({ id: userId, nome, matricula, turmaId })
      await onPronto()
    } catch (e) {
      setErro(e.message.includes('duplicate') ? 'Essa matrícula já está cadastrada.' : e.message)
      setEnviando(false)
    }
  }

  return (
    <div className="centro">
      <BotaoTema />
      <form className="card login" onSubmit={salvar}>
        <h2>Complete o seu cadastro</h2>
        <p className="muted">{email}</p>

        <label>
          Nome completo
          <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={150} />
        </label>
        <label>
          Matrícula
          <input value={matricula} onChange={(e) => setMatricula(e.target.value)} required maxLength={30} />
        </label>
        <label>
          Turma
          <select value={turmaId} onChange={(e) => setTurmaId(e.target.value)} required>
            <option value="">Escolha…</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>{t.apelido}</option>
            ))}
          </select>
        </label>

        <Erro>{erro}</Erro>

        <button className="btn primario" disabled={enviando}>{enviando ? '…' : 'Salvar'}</button>
        <button type="button" className="btn fantasma" onClick={sair}>Sair</button>
      </form>
    </div>
  )
}
