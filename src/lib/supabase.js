import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se o .env.local não foi lido, avisa na tela em vez de ficar tudo preto/branco
export const configurado = Boolean(url && key)

export const supabase = configurado ? createClient(url, key) : null
