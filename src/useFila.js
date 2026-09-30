import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { listarChamadosAbertos, listarSessoesAtivas } from './api'

// Carrega as filas abertas e os chamados, e recarrega sozinho
// sempre que algo muda no banco (Supabase Realtime).
export function useFila() {
  const [sessoes, setSessoes] = useState([])
  const [chamados, setChamados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0) // muda a cada recarga

  const recarregar = useCallback(async () => {
    try {
      const s = await listarSessoesAtivas()
      const c = await listarChamadosAbertos(s.map((x) => x.id))
      setSessoes(s)
      setChamados(c)
      setErro('')
      setVersao((v) => v + 1)
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()

    const canal = supabase
      .channel('fila-simples')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_sessoes' }, recarregar)
      .subscribe()

    // Segurança extra: se o tempo real cair, atualiza a cada 20 s
    const timer = setInterval(recarregar, 20000)

    return () => {
      clearInterval(timer)
      supabase.removeChannel(canal)
    }
  }, [recarregar])

  return { sessoes, chamados, carregando, erro, recarregar, versao }
}

// "há 3 min" que se atualiza sozinho
export function useAgora(intervalo = 15000) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervalo)
    return () => clearInterval(t)
  }, [intervalo])
  return agora
}

export function tempoDesde(iso, agora) {
  const seg = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (seg < 60) return 'agora'
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min} min`
  return `há ${Math.floor(min / 60)} h ${min % 60} min`
}

export function formatarSegundos(seg) {
  if (seg == null) return '—'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m ? `${m} min ${s.toString().padStart(2, '0')} s` : `${s} s`
}
