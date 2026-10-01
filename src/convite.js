// Guarda o token do convite (que chega na URL ?convite=...) enquanto a
// pessoa faz login ou cria a conta, e tira da barra de endereço.
const CHAVE = 'fila-convite'

export function capturarConviteDaUrl() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('convite')
  if (token) {
    try { sessionStorage.setItem(CHAVE, token) } catch { /* sem storage */ }
    params.delete('convite')
    const resto = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : ''))
  }
}

export function conviteGuardado() {
  try { return sessionStorage.getItem(CHAVE) } catch { return null }
}

export function esquecerConvite() {
  try { sessionStorage.removeItem(CHAVE) } catch { /* sem storage */ }
}
