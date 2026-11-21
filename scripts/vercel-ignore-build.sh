#!/bin/sh
# ============================================================================
# Ignored Build Step de Vercel (21/11/2026)
# ============================================================================
# Vercel corre esto antes de cada build (campo "ignoreCommand" del vercel.json
# de cada app). Código de salida: 0 = NO compilar (se cancela, no gasta build
# minutes) · cualquier otro = compilar.
#
# Uso: sh ../../scripts/vercel-ignore-build.sh <ruta> [<ruta> ...]
#   Rutas relativas a la raíz del repo que afectan a esa app.
#
# Regla: se compila solo si alguna de esas rutas cambió desde el último
# deploy exitoso de la MISMA rama (VERCEL_GIT_PREVIOUS_SHA). Ante cualquier
# duda (primer deploy, commit previo fuera del clon, error de git) se compila:
# nunca se saltea un deploy por no poder comparar.
# Para forzar un build sin cambios: Redeploy desde el panel de Vercel.
# ============================================================================

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ../..)" || exit 1

PREV="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$PREV" ]; then
  echo "[ignore-build] Sin deploy previo en esta rama: se compila."
  exit 1
fi

if ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  # El clon de Vercel es superficial: si el último deploy quedó lejos, se trae.
  git fetch --quiet --depth=200 origin "$VERCEL_GIT_COMMIT_REF" 2>/dev/null
fi
if ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "[ignore-build] No se encuentra $PREV en el clon: se compila por seguridad."
  exit 1
fi

git diff --quiet "$PREV" HEAD -- "$@"
case $? in
  0) echo "[ignore-build] Sin cambios en: $* desde $PREV. Build salteado."; exit 0 ;;
  1) echo "[ignore-build] Hay cambios en: $*. Se compila."; exit 1 ;;
  *) echo "[ignore-build] git diff falló: se compila por seguridad."; exit 1 ;;
esac
