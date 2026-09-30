import { useState } from 'react'
import { criarConta, entrar } from '../api'
import { CampoSenha, Erro } from '../components/ui'
import { BotaoTema, Marca } from '../components/Topo'

export default function Login() {
  const [modo, setModo] = useState('entrar') // 'entrar' | 'criar'
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        await entrar(email, senha)
      } else {
        const r = await criarConta(email, senha)
        // Se a confirmação de e-mail estiver ligada no Supabase, não vem sessão
        if (!r.session) setAviso('Conta criada! Confira o seu e-mail para confirmar.')
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="centro">
      <BotaoTema />
      <form className="card login" onSubmit={enviar}>
        <Marca grande />

        <div className="alternar">
          <button type="button" className={modo === 'entrar' ? 'ativa' : ''} onClick={() => setModo('entrar')}>
            Entrar
          </button>
          <button type="button" className={modo === 'criar' ? 'ativa' : ''} onClick={() => setModo('criar')}>
            Criar conta
          </button>
        </div>

        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Senha
          <CampoSenha
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            minLength={6}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
        </label>

        <Erro>{erro}</Erro>
        {aviso && <p className="ok">{aviso}</p>}

        <button className="btn primario" disabled={enviando}>
          {enviando ? '…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </div>
  )
}
