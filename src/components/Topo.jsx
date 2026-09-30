import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { useTema } from '../tema'

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
