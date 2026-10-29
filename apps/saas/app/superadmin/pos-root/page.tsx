import { readFileSync } from "fs"
import { join } from "path"
import { redirect } from "next/navigation"
import { FileText } from "lucide-react"
import { auth } from "@/lib/auth"
import { scopePosDocCss, splitPosDocHtml } from "@/lib/posDocCss"

export const dynamic = "force-dynamic"

const DOC_FILE = join("docs", "pos-root-interface.html")

function readDocument() {
  try {
    return readFileSync(join(process.cwd(), DOC_FILE), "utf-8")
  } catch (err) {
    console.error(`No se pudo leer ${DOC_FILE}:`, err)
    return ""
  }
}

export default async function PosRootPage() {
  const session = await auth()
  if (!session || session.user.role !== "superadmin") redirect("/login")

  const { css, body } = splitPosDocHtml(readDocument())
  const scopedCss = scopePosDocCss(css)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <FileText size={20} />
          </div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            POS Root · Documento de diseño
          </h1>
        </div>
        <p className="text-muted-foreground text-sm ml-[3.25rem]">
          Estudio del corpus /POS y propuesta de la interfaz raíz de
          pos.takeasygo.com. Documento de solo lectura: los ajustes de UX/UI los
          aplica el equipo de ingeniería.
        </p>
      </div>

      {body ? (
        <div className="-mx-4 md:-mx-8 lg:-mx-10">
          <div className="posdoc">
            <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            <div dangerouslySetInnerHTML={{ __html: body }} />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No se pudo cargar el documento. Verificá que exista{" "}
          <code className="font-mono">{DOC_FILE}</code>.
        </p>
      )}
    </div>
  )
}
