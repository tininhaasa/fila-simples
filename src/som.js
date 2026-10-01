import { useEffect, useRef, useState } from 'react'

// Avisos sonoros gerados pelo próprio navegador (Web Audio API),
// sem arquivo de áudio. O navegador só libera som depois que a pessoa
// interage com a página (um clique), por isso "destravamos" no 1º clique.

const CHAVE = 'fila-som'
let ctx = null

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Destrava o áudio no primeiro clique/toque em qualquer lugar
if (typeof window !== 'undefined') {
  const destravar = () => {
    contexto()
    window.removeEventListener('pointerdown', destravar)
    window.removeEventListener('keydown', destravar)
  }
  window.addEventListener('pointerdown', destravar)
  window.addEventListener('keydown', destravar)
}

// Cada aviso é uma sequência de notas: [frequência em Hz, duração em s]
const SONS = {
  novo: [[660, 0.12], [880, 0.18]],                    // chamado novo na fila (sobe)
  resposta: [[784, 0.1], [988, 0.1], [1175, 0.2]],      // resposta de colega pra aprovar
  sua_vez: [[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.3]], // aluno chamado pela professora
}

export function somLigado() {
  try {
    return localStorage.getItem(CHAVE) !== 'desligado'
  } catch {
    return true
  }
}

export function tocar(tipo) {
  if (!somLigado()) return
  const ac = contexto()
  const notas = SONS[tipo]
  if (!ac || !notas || ac.state !== 'running') return

  let t = ac.currentTime + 0.02
  for (const [freq, dur] of notas) {
    const osc = ac.createOscillator()
    const vol = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    vol.gain.setValueAtTime(0.0001, t)
    vol.gain.exponentialRampToValueAtTime(0.25, t + 0.015)
    vol.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(vol).connect(ac.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    t += dur * 0.9
  }
}

// Liga/desliga, guardando no navegador
export function useSom() {
  const [ligado, setLigado] = useState(somLigado)

  function alternar() {
    const novo = !ligado
    setLigado(novo)
    try {
      localStorage.setItem(CHAVE, novo ? 'ligado' : 'desligado')
    } catch {
      // sem localStorage: vale só até fechar a aba
    }
    if (novo) {
      contexto()
      setTimeout(() => tocar('novo'), 50) // amostra do som ao ligar
    }
  }

  return [ligado, alternar]
}

// Compara a lista de chamados com a anterior e toca quando algo muda.
// regras(antes, depois) devolve o tipo de som ou null.
// Na primeira carga só memoriza (não toca por tudo que já estava lá).
export function useAvisoSonoro(chamados, regras) {
  const vistos = useRef(null)

  useEffect(() => {
    const atual = new Map(chamados.map((c) => [c.id, c.status]))
    if (vistos.current) {
      let tipo = null
      for (const c of chamados) {
        const t = regras(vistos.current.get(c.id), c)
        // prioridade: sua_vez > resposta > novo
        if (t === 'sua_vez' || (t === 'resposta' && tipo !== 'sua_vez') || (t && !tipo)) tipo = t
      }
      if (tipo) tocar(tipo)
    }
    vistos.current = atual
  }, [chamados]) // eslint-disable-line react-hooks/exhaustive-deps
}
