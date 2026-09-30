import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash, faXmark } from '@fortawesome/free-solid-svg-icons'

// Botão que roda uma ação assíncrona: desabilita enquanto roda
// e mostra o erro do banco (ex.: "Você já tem um chamado aberto.")
export function BotaoAcao({ acao, confirmar, className = 'btn', children, onErro }) {
  const [rodando, setRodando] = useState(false)

  async function clicar() {
    if (confirmar && !window.confirm(confirmar)) return
    setRodando(true)
    try {
      await acao()
    } catch (e) {
      if (onErro) onErro(e.message)
      else window.alert(e.message)
    } finally {
      setRodando(false)
    }
  }

  return (
    <button type="button" className={className} onClick={clicar} disabled={rodando}>
      {rodando ? '…' : children}
    </button>
  )
}

const ROTULOS = {
  aguardando: 'Na fila',
  em_atendimento: 'Em atendimento',
  respondido: 'Resposta de colega',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
}

export function Status({ status }) {
  return <span className={`status s-${status}`}>{ROTULOS[status] || status}</span>
}

export function Erro({ children }) {
  if (!children) return null
  return <p className="erro">{children}</p>
}

// Janela sobreposta (fecha com Esc ou clicando fora)
export function Modal({ titulo, onFechar, largo = false, children }) {
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
    }
  }, [onFechar])

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`modal ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="modal-topo">
          <h2>{titulo}</h2>
          <button type="button" className="btn-icone" onClick={onFechar} aria-label="Fechar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  )
}

// Campo de senha com o botão de olho para mostrar/esconder o que foi digitado
export function CampoSenha({ value, onChange, ...resto }) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="campo-senha">
      <input type={visivel ? 'text' : 'password'} value={value} onChange={onChange} {...resto} />
      <button
        type="button"
        className="olho"
        onClick={() => setVisivel((v) => !v)}
        title={visivel ? 'Esconder senha' : 'Mostrar senha'}
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
        aria-pressed={visivel}
      >
        <FontAwesomeIcon icon={visivel ? faEyeSlash : faEye} fixedWidth />
      </button>
    </div>
  )
}
