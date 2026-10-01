import { useEffect, useState } from 'react'
import { configurado, supabase } from './lib/supabase'
import { buscarPerfil, sair } from './api'
import Login from './pages/Login'
import CompletarPerfil from './pages/CompletarPerfil'
import Aluno from './pages/Aluno'
import Professora from './pages/Professora'
import Dashboard from './pages/Dashboard'
import { BotaoSom, BotaoTema, Marca } from './components/Topo'

export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = ainda carregando
  const [perfil, setPerfil] = useState(undefined)
  const [aba, setAba] = useState('fila')

  // 1) Descobre se tem alguém logado e escuta login/logout
  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // 2) Com alguém logado, busca o perfil (nome, turma, papel)
  const userId = sessao?.user?.id
  useEffect(() => {
    if (!userId) {
      setPerfil(undefined)
      return
    }
    let ativo = true
    buscarPerfil(userId)
      .then((p) => ativo && setPerfil(p))
      .catch(() => ativo && setPerfil(null))
    return () => {
      ativo = false
    }
  }, [userId])

  if (!configurado) {
    return (
      <Centro>
        <div className="card aviso">
          <h2>Falta configurar o Supabase</h2>
          <p>
            Crie o arquivo <code>.env.local</code> na pasta do projeto (copie do{' '}
            <code>.env.local.example</code>), coloque a URL e a chave anon e rode{' '}
            <code>npm run dev</code> de novo.
          </p>
        </div>
      </Centro>
    )
  }

  if (sessao === undefined || (userId && perfil === undefined)) {
    return <Centro><p className="muted">Carregando…</p></Centro>
  }

  if (!sessao) return <Login />

  if (!perfil) {
    return (
      <CompletarPerfil
        userId={userId}
        email={sessao.user.email}
        onPronto={() => buscarPerfil(userId).then(setPerfil)}
      />
    )
  }

  const professora = perfil.papel === 'admin'

  return (
    <div className="app">
      <header className="topo">
        <Marca />

        {professora && (
          <nav className="abas">
            <button className={aba === 'fila' ? 'ativa' : ''} onClick={() => setAba('fila')}>
              Fila
            </button>
            <button className={aba === 'dash' ? 'ativa' : ''} onClick={() => setAba('dash')}>
              Dashboard
            </button>
          </nav>
        )}

        <div className="usuario">
          <span className="nome">
            {perfil.nome_completo.split(' ')[0]}
            <small>{professora ? 'Professora' : perfil.turma?.apelido}</small>
          </span>
          <BotaoSom />
          <BotaoTema />
          <button className="btn fantasma" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="conteudo">
        {!professora && <Aluno perfil={perfil} />}
        {professora && aba === 'fila' && <Professora />}
        {professora && aba === 'dash' && <Dashboard />}
      </main>
    </div>
  )
}

function Centro({ children }) {
  return (
    <div className="centro">
      <BotaoTema />
      {children}
    </div>
  )
}
