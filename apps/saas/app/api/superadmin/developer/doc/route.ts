import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const file = searchParams.get('file')

    if (!file) {
      return NextResponse.json({ error: 'Parámetro file requerido' }, { status: 400 })
    }

    const docsDir = join(process.cwd(), 'docs')
    const docPath = join(docsDir, file)

    if (!docPath.startsWith(docsDir) || !docPath.endsWith('.md')) {
      return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 })
    }

    if (!existsSync(docPath)) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    const content = readFileSync(docPath, 'utf-8')

    return NextResponse.json({ content, file })
  } catch (error) {
    return NextResponse.json({ error: 'Error al leer documento' }, { status: 500 })
  }
}
