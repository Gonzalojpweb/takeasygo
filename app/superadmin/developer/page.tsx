import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import DeveloperClient from '@/components/developer/DeveloperClient'

export default async function DeveloperPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>
}) {
  const { doc } = await searchParams
  const docsDir = join(process.cwd(), 'docs')

  let files: { name: string; label: string; description: string }[] = []
  let initialDoc = 'MASTER.md'
  let initialContent = ''

  try {
    if (existsSync(docsDir)) {
      const allFiles = readdirSync(docsDir)
        .filter(f => f.endsWith('.md'))

      files = allFiles.map(name => ({
        name,
        label: name.replace('.md', ''),
        description: '',
      }))

      const requestedDoc = doc && allFiles.includes(doc) ? doc : 'MASTER.md'
      initialDoc = requestedDoc

      const docPath = join(docsDir, requestedDoc)
      if (existsSync(docPath)) {
        initialContent = readFileSync(docPath, 'utf-8')
      }
    }
  } catch (err) {
    console.error('Error reading docs:', err)
  }

  return (
    <DeveloperClient
      files={files}
      initialDoc={initialDoc}
      initialContent={initialContent}
    />
  )
}
