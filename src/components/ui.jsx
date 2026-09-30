import { useState } from 'react'

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
    <button className={className} onClick={clicar} disabled={rodando}>
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
