import { useEffect, useRef, useState } from 'react'

// Avisos sonoros gerados pelo próprio navegador (Web Audio API),
// sem arquivo de áudio. O navegador só libera som depois que a pessoa
// interage com a página (um clique), por isso "destravamos" nos cliques.

const CHAVE = 'fila-som'
const VOLUME = 0.9 // volume geral (0 a 1); o compressor segura os picos
let ctx = null
let saida = null // compressor -> ganho geral -> alto-falante
const ouvintes = new Set() // avisa os componentes quando o áudio é liberado/bloqueado

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()

    // Compressor deixa o som mais "cheio" e alto sem estourar
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.knee.value = 12
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.15
    const geral = ctx.createGain()
    geral.gain.value = VOLUME
    comp.connect(geral).connect(ctx.destination)
    saida = comp

    ctx.onstatechange = () => ouvintes.forEach((f) => f())
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  return ctx
}

export function audioLiberado() {
  return !!ctx && ctx.state === 'running'
}

// Destrava (e re-destrava, se o navegador suspender) a cada clique/toque.
// Os listeners ficam sempre ativos: se já estiver rodando, não faz nada.
if (typeof window !== 'undefined') {
  const destravar = () => {
    if (!audioLiberado()) contexto()
  }
  window.addEventListener('pointerdown', destravar)
  window.addEventListener('keydown', destravar)
  window.addEventListener('touchend', destravar) // iOS
}

// Cada aviso é uma sequência de notas: [frequência em Hz, duração em s]
const SONS = {
  novo: [[660, 0.16], [880, 0.24]],                    // chamado novo na fila (sobe)
  resposta: [[784, 0.13], [988, 0.13], [1175, 0.26]],   // resposta de colega pra aprovar
  sua_vez: [[523, 0.18], [659, 0.18], [784, 0.18], [1047, 0.4]], // aluno chamado pela professora
}

export function somLigado() {
  try {
    return localStorage.getItem(CHAVE) !== 'desligado'
  } catch {
    return true
  }
}

function agendar(ac, notas) {
  let t = ac.currentTime + 0.03
  for (const [freq, dur] of notas) {
    // Duas ondas por nota: a fundamental (triângulo, mais "presente" que seno
    // em alto-falante pequeno) + uma oitava acima, mais baixa, para dar brilho
    const vol = ac.createGain()
    vol.connect(saida)
    for (const [tipo, mult, nivel] of [['triangle', 1, 1], ['sine', 2, 0.35]]) {
      const osc = ac.createOscillator()
      const g = ac.createGain()
      osc.type = tipo
      osc.frequency.value = freq * mult
      g.gain.value = nivel
      osc.connect(g).connect(vol)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    }
    // Ataque rápido, segura o volume e só então desce (antes caía na hora)
    vol.gain.setValueAtTime(0.0001, t)
    vol.gain.exponentialRampToValueAtTime(0.8, t + 0.01)
    vol.gain.setValueAtTime(0.8, t + dur * 0.6)
    vol.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    t += dur * 0.9
  }
}

export function tocar(tipo) {
  if (!somLigado()) return
  const ac = contexto()
  const notas = SONS[tipo]
  if (!ac || !notas) return

  if (ac.state === 'running') agendar(ac, notas)
  // Suspenso: espera o resume terminar em vez de perder o aviso
  // (se o navegador ainda não liberou, o resume fica pendente até o próximo clique)
  else ac.resume().then(() => agendar(ac, notas)).catch(() => {})
}

// Liga/desliga, guardando no navegador.
// Também diz se o navegador ainda está bloqueando o áudio (falta um clique).
export function useSom() {
  const [ligado, setLigado] = useState(somLigado)
  const [liberado, setLiberado] = useState(audioLiberado)

  useEffect(() => {
    const atualizar = () => setLiberado(audioLiberado())
    ouvintes.add(atualizar)
    atualizar()
    return () => ouvintes.delete(atualizar)
  }, [])

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

  return [ligado, alternar, liberado]
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
