import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChalkboardUser, faCircleExclamation } from '@fortawesome/free-solid-svg-icons'
import { aceitarConvite, sair, verConvite } from '../api'
import { Erro } from '../components/ui'
import { BotaoTema } from '../components/Topo'

// Tela que aparece quando a pessoa entra pelo link de convite de professor
export default function AceitarConvite({ token, perfil, email, onFim }) {
  const [info, setInfo] = useState(null)
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    verConvite(token)
      .then(setInfo)
      .catch((e) => setInfo({ valido: false, motivo: e.message }))
  }, [token])

  async function aceitar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await aceitarConvite(token, perfil ? null : nome, perfil ? null : matricula)
      await onFim(true)
    } catch (e) {
      setErro(e.message)
      setEnviando(false)
    }
  }

  return (
    <div className="centro">
      <BotaoTema />
      <form className="card login" onSubmit={aceitar}>
        <div className="icone-grande"><FontAwesomeIcon icon={faChalkboardUser} /></div>
        <h2>Convite de professor(a)</h2>

        {!info && <p className="muted">Carregando convite…</p>}

        {info && !info.valido && (
          <>
            <p className="erro"><FontAwesomeIcon icon={faCircleExclamation} /> {info.motivo}</p>
            <button type="button" className="btn" onClick={() => onFim(false)}>Continuar sem o convite</button>
          </>
        )}

        {info?.valido && (
          <>
            <p>
              <b>{info.convidado_por || 'Um professor'}</b> convidou você para ser professor(a) da turma{' '}
              <b>{info.turma}</b>.
            </p>
            <p className="muted pequeno">Entrando como {email}</p>

            {!perfil && (
              <>
                <label>
                  Seu nome completo
                  <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={150} autoFocus />
                </label>
                <label>
                  Matrícula / registro funcional
                  <input value={matricula} onChange={(e) => setMatricula(e.target.value)} required maxLength={30} />
                </label>
              </>
            )}

            {perfil?.papel === 'aluno' && (
              <p className="aviso-caixa">
                Esta conta hoje é de <b>aluno</b>. Ao aceitar, ela passa a ser de professor(a)
                e sai da lista de alunos da turma {perfil.turma?.apelido}.
              </p>
            )}

            <Erro>{erro}</Erro>
            <button className="btn laranja" disabled={enviando}>{enviando ? '…' : 'Aceitar convite'}</button>
            <button type="button" className="btn fantasma" onClick={() => onFim(false)}>Agora não</button>
          </>
        )}

        {!perfil && (
          <button type="button" className="btn fantasma pequeno" onClick={sair}>
            Não é você? Sair
          </button>
        )}
      </form>
    </div>
  )
}
