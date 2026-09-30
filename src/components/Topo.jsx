import { useTema } from '../tema'

export function Marca({ grande = false }) {
  return (
    <div className={grande ? 'marca grande' : 'marca'}>
      <span className="logo">?</span>
      <div>
        <strong>Fila de Dúvidas</strong>
        <small>SENAI Lages</small>
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
      {escuro ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </svg>
      )}
    </button>
  )
}
