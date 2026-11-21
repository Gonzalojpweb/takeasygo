// ============================================================================
// Pantalla de vinculación: código de 6 caracteres + QR, vence a los 10 min
// ============================================================================
// El comercio ingresa el código en TakeasyGO › Pantallas (o escanea el QR).
// La pantalla consulta cada 3 s; cuando la vinculan retira su token (una vez,
// con su nonce) y arranca el reproductor.
// ============================================================================
import QRCode from 'qrcode'
import { postJson } from './api'
import { store } from './store'
import { CURRENT_BUILD } from '../build'

interface StartResp { pairingId?: string; code?: string; expiresAt?: string; linkUrl?: string; error?: string }
interface StatusResp { status?: string; token?: string; error?: string }

export function mountPairing(root: HTMLElement, onPaired: () => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let tick: ReturnType<typeof setInterval> | null = null

  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:4vmin;text-align:center;background:#000">
      <div style="max-width:90vw">
        <p style="color:var(--muted);font-size:clamp(14px,2.2vmin,24px);margin:0 0 2vmin">TakeasyGO Pantallas</p>
        <h1 style="font-size:clamp(18px,3.4vmin,40px);margin:0 0 3vmin">Vinculá esta pantalla</h1>
        <div style="display:flex;gap:5vmin;align-items:center;justify-content:center;flex-wrap:wrap">
          <div>
            <div id="code" style="font:800 clamp(40px,12vmin,160px)/1 ui-monospace,monospace;letter-spacing:.12em">······</div>
            <p id="exp" style="color:var(--muted);font-size:clamp(12px,2vmin,22px);margin:2vmin 0 0"></p>
          </div>
          <div id="qr" style="background:#fff;padding:1.6vmin;border-radius:1.6vmin;width:clamp(140px,30vmin,360px);aspect-ratio:1"></div>
        </div>
        <p style="font-size:clamp(14px,2.4vmin,28px);margin:4vmin 0 0;line-height:1.4">En el panel de TakeasyGO entrá a <b>Marketing › Pantallas</b>,<br>tocá <b>Vincular pantalla</b> y escribí el código (o escaneá el QR).</p>
        <p id="msg" role="status" style="color:var(--warn);min-height:1.4em;font-size:clamp(12px,2vmin,22px);margin:2vmin 0 0"></p>
        <p style="color:#555;font-size:12px;margin-top:3vmin">Versión ${CURRENT_BUILD.version} · <a href="/diagnostico" style="color:#777">diagnóstico</a></p>
      </div>
    </main>`
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

  const schedule = (fn: () => void, ms: number) => { if (!stopped) timer = setTimeout(fn, ms) }

  async function render(p: { code: string; expiresAt: string; linkUrl: string }) {
    $('code').textContent = p.code
    try { $('qr').innerHTML = await QRCode.toString(p.linkUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) } catch { $('qr').textContent = '' }
    if (tick) clearInterval(tick)
    const upd = () => {
      const left = Math.max(0, Date.parse(p.expiresAt) - Date.now())
      $('exp').textContent = left > 0 ? `Vence en ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : 'Venció: pidiendo uno nuevo…'
    }
    upd()
    tick = setInterval(upd, 1000)
  }

  async function newCode() {
    $('msg').textContent = ''
    store.clearPairing()
    try {
      const { status, data } = await postJson<StartResp>('/api/display/pair/start', { nonce: store.nonce() })
      if (status === 429) { $('msg').textContent = data.error || 'Demasiados códigos pedidos desde esta red. Reintento en un minuto.'; schedule(newCode, 60_000); return }
      if (status !== 201 || !data.code || !data.pairingId) { $('msg').textContent = data.error || 'No se pudo pedir un código. Reintento…'; schedule(newCode, 15_000); return }
      const p = { pairingId: data.pairingId, code: data.code, expiresAt: data.expiresAt!, linkUrl: data.linkUrl! }
      store.setPairing(p)
      await render(p)
      schedule(poll, 3000)
    } catch {
      $('msg').textContent = 'Sin conexión. Reintento en 15 s…'
      schedule(newCode, 15_000)
    }
  }

  async function poll() {
    const p = store.pairing()
    if (!p || Date.parse(p.expiresAt) <= Date.now()) { void newCode(); return }
    try {
      const { status, data } = await postJson<StatusResp>('/api/display/pair/status', { pairingId: p.pairingId, nonce: store.nonce() })
      if (status === 200 && data.status === 'active' && data.token) {
        store.setToken(data.token)
        store.clearPairing()
        store.resetNonce()
        stop()
        onPaired()
        return
      }
      if (status === 410 || status === 403) { void newCode(); return }
      schedule(poll, 3000)
    } catch {
      $('msg').textContent = 'Sin conexión. Sigo intentando…'
      schedule(poll, 5000)
    }
  }

  function stop() {
    stopped = true
    if (timer) clearTimeout(timer)
    if (tick) clearInterval(tick)
  }

  const existing = store.pairing()
  if (existing && Date.parse(existing.expiresAt) > Date.now() + 15_000) { void render(existing); schedule(poll, 500) }
  else void newCode()
  return stop
}
