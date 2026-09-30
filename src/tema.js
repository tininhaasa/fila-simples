import { useEffect, useState } from 'react'

// Tema claro/escuro. Guarda a escolha no navegador; na primeira vez
// segue o tema do sistema operacional.
const CHAVE = 'fila-tema'

export function temaInicial() {
  try {
    const salvo = localStorage.getItem(CHAVE)
    if (salvo === 'claro' || salvo === 'escuro') return salvo
  } catch {
    // navegador sem localStorage: segue o sistema
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
}

export function useTema() {
  const [tema, setTema] = useState(temaInicial)

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    try {
      localStorage.setItem(CHAVE, tema)
    } catch {
      // sem problema, só não lembra na próxima vez
    }
  }, [tema])

  const alternar = () => setTema((t) => (t === 'escuro' ? 'claro' : 'escuro'))
  return [tema, alternar]
}
