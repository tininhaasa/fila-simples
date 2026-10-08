import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell, faBellSlash, faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { useTema } from '../tema'
import { useSom } from '../som'

export function Marca({ grande = false }) {
  return (
    <div className={grande ? 'marca grande' : 'marca'}>
      <span className="logo"><img src="/logo.png" alt="" /></span>
      <div>
        <strong>Fila de Dúvidas</strong>
      </div>
    </div>
  )
}

// Botão sol/lua para trocar entre modo claro e escuro
export function BotaoTema() {
  const [tema, alternar] = useTema()
  const escuro = tema === 'escuro'

  return (
    <button
      className="btn-tema"
      onClick={alternar}
      title={escuro ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      aria-label={escuro ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
    >
      <FontAwesomeIcon icon={escuro ? faSun : faMoon} />
    </button>
  )
}

// Sino para ligar/desligar os avisos sonoros
export function BotaoSom() {
  const [ligado, alternar, liberado] = useSom()
  // Ligado, mas o navegador ainda não liberou o áudio (falta um clique na página)
  const bloqueado = ligado && !liberado
  return (
    <button
      className={`btn-tema ${ligado ? '' : 'mudo'} ${bloqueado ? 'bloqueado' : ''}`}
      onClick={bloqueado ? undefined : alternar}
      title={
        bloqueado ? 'Clique em qualquer lugar da página para ativar os avisos sonoros'
          : ligado ? 'Som ligado — clique para silenciar' : 'Som desligado — clique para ligar'
      }
      aria-label={ligado ? 'Desligar avisos sonoros' : 'Ligar avisos sonoros'}
      aria-pressed={ligado}
    >
      <FontAwesomeIcon icon={ligado ? faBell : faBellSlash} />
    </button>
  )
}
