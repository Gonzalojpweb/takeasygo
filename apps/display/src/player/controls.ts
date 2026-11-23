// ============================================================================
// Controles del reproductor: cursor y panel discreto
// ============================================================================
// · El cursor se oculta a los 3 s sin actividad y vuelve con movimiento,
//   toque o tecla. Con él aparece un panel chico abajo: nombre, estado,
//   «Pantalla completa», «Desvincular» y «Cerrar».
// · Esc cierra la confirmación o el panel.
// · Desvincular pide confirmación EN PANTALLA (sin window.confirm, que en
//   algunos TV Box bloquea la página) y necesita internet: revoca el token en
//   el servidor y recién ahí borra el del equipo.
// ============================================================================

export interface ControlsOptions {
  root: HTMLElement
  /** Nombre y estado a mostrar cuando se abre el panel. */
  status: () => { name: string; line: string }
  onFullscreen: () => void
  /** Desvincula en el servidor. true = listo; string = motivo del error. */
  onUnlink: () => Promise<true | string>
  onUnlinked: () => void
}

const IDLE_MS = 3000

export function mountControls(o: ControlsOptions): () => void {
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let confirmOpen = false
  let busy = false

  const btnCss = 'min-height:48px;padding:0 18px;border-radius:12px;border:0;font:600 15px system-ui,sans-serif;cursor:pointer'
  const panel = document.createElement('div')
  panel.setAttribute('role', 'toolbar')
  panel.setAttribute('aria-label', 'Controles de la pantalla')
  panel.style.cssText = 'position:fixed;left:0;right:0;margin:0 auto;width:fit-content;bottom:2vmin;z-index:20;display:none;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;max-width:94vw;padding:10px 12px;border-radius:16px;background:rgba(20,20,20,.88);color:#fff;font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)'
  const info = document.createElement('div')
  info.style.cssText = 'padding:0 8px;line-height:1.3;min-width:0'
  const mk = (label: string, css: string) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText = `${btnCss};${css}`
    return b
  }
  const fsBtn = mk('Pantalla completa', 'background:#fff;color:#000')
  const unlinkBtn = mk('Desvincular', 'background:transparent;color:#ffb4a8;border:1px solid #7a3b33')
  const closeBtn = mk('Cerrar', 'background:transparent;color:#ddd;border:1px solid #555')
  panel.append(info, fsBtn, unlinkBtn, closeBtn)

  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'alertdialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'tgd-unlink-title')
  dialog.style.cssText = 'position:fixed;inset:0;z-index:30;display:none;place-items:center;background:rgba(0,0,0,.7);font:16px system-ui,sans-serif'
  dialog.innerHTML = `
    <div style="background:#1b1b1b;color:#fff;max-width:min(92vw,520px);padding:24px;border-radius:18px;text-align:left">
      <h2 id="tgd-unlink-title" style="margin:0 0 8px;font-size:20px">¿Desvincular esta pantalla?</h2>
      <p style="margin:0 0 6px;color:#ccc;line-height:1.4">Deja de mostrar contenido y para volver a usarla vas a necesitar un código nuevo desde el panel de TakeasyGO.</p>
      <p data-msg style="margin:8px 0 0;color:#ffb4a8;min-height:1.3em"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
        <button type="button" data-cancel style="${btnCss};background:#fff;color:#000">Cancelar</button>
        <button type="button" data-ok style="${btnCss};background:#b3261e;color:#fff">Sí, desvincular</button>
      </div>
    </div>`
  const msg = dialog.querySelector<HTMLElement>('[data-msg]')!
  const cancelBtn = dialog.querySelector<HTMLButtonElement>('[data-cancel]')!
  const okBtn = dialog.querySelector<HTMLButtonElement>('[data-ok]')!
  o.root.append(panel, dialog)

  const setCursor = (visible: boolean) => { document.documentElement.style.cursor = visible ? 'default' : 'none'; document.body.style.cursor = visible ? 'default' : 'none' }
  const hide = () => {
    if (confirmOpen) return
    panel.style.display = 'none'
    setCursor(false)
  }
  const armHide = () => { if (hideTimer) clearTimeout(hideTimer); hideTimer = setTimeout(hide, IDLE_MS) }
  const show = () => {
    const s = o.status()
    info.innerHTML = ''
    const n = document.createElement('div'); n.style.fontWeight = '700'; n.textContent = s.name
    const l = document.createElement('div'); l.style.color = '#aaa'; l.style.fontSize = '12px'; l.textContent = s.line
    info.append(n, l)
    fsBtn.style.display = document.fullscreenElement ? 'none' : ''
    panel.style.display = 'flex'
    setCursor(true)
    armHide()
  }
  const openConfirm = () => {
    confirmOpen = true
    msg.textContent = ''
    dialog.style.display = 'grid'
    setCursor(true)
    cancelBtn.focus()
  }
  const closeConfirm = () => {
    confirmOpen = false
    dialog.style.display = 'none'
    armHide()
  }

  const onActivity = () => { if (!confirmOpen) show() }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (confirmOpen) closeConfirm()
      else hide()
      return
    }
    onActivity()
  }
  window.addEventListener('pointermove', onActivity)
  window.addEventListener('pointerdown', onActivity)
  window.addEventListener('keydown', onKey)
  fsBtn.addEventListener('click', () => { o.onFullscreen(); armHide() })
  closeBtn.addEventListener('click', () => hide())
  unlinkBtn.addEventListener('click', openConfirm)
  cancelBtn.addEventListener('click', closeConfirm)
  okBtn.addEventListener('click', async () => {
    if (busy) return
    busy = true
    okBtn.disabled = true
    msg.textContent = 'Desvinculando…'
    const r = await o.onUnlink().catch((e) => String((e as Error)?.message ?? e))
    busy = false
    okBtn.disabled = false
    if (r === true) { confirmOpen = false; dialog.style.display = 'none'; o.onUnlinked(); return }
    msg.textContent = r
  })
  setCursor(false)

  return () => {
    if (hideTimer) clearTimeout(hideTimer)
    window.removeEventListener('pointermove', onActivity)
    window.removeEventListener('pointerdown', onActivity)
    window.removeEventListener('keydown', onKey)
    panel.remove()
    dialog.remove()
    setCursor(true)
  }
}
