'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

function CodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string; children?: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || '')
  const isInline = !match
  const [copied, setCopied] = React.useState(false)
  const codeRef = React.useRef<HTMLElement>(null)

  const handleCopy = async () => {
    const text = codeRef.current?.textContent || ''
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isInline) {
    return (
      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary" {...props}>
        {children}
      </code>
    )
  }

  return (
    <div className="relative group my-4">
      <div className="flex items-center justify-between bg-muted/80 rounded-t-lg border border-border/50 px-4 py-1.5">
        <span className="text-xs text-muted-foreground font-mono">{match[1]}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <><Check size={14} className="text-green-500" /> Copiado</>
          ) : (
            <><Copy size={14} /> Copiar</>
          )}
        </Button>
      </div>
      <div className="relative">
        <pre className="!mt-0 !rounded-t-none !border-t-0 overflow-x-auto">
          <code ref={codeRef} className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  )
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-4 border border-border/50 rounded-lg">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  )
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-muted/50">
      {children}
    </thead>
  )
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 border-b border-border/50">
      {children}
    </th>
  )
}

function TableRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
      {children}
    </tr>
  )
}

function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3 text-muted-foreground">
      {children}
    </td>
  )
}

const Heading = ({ level, children }: { level: 1 | 2 | 3 | 4 | 5 | 6; children: React.ReactNode }) => {
  const id = React.Children.toArray(children)
    .filter((child): child is string => typeof child === 'string')
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const sizes: Record<number, string> = {
    1: 'text-2xl font-bold mt-8 mb-4 text-foreground scroll-mt-20',
    2: 'text-xl font-semibold mt-6 mb-3 text-foreground scroll-mt-20 border-b border-border/30 pb-2',
    3: 'text-lg font-semibold mt-5 mb-2 text-foreground scroll-mt-20',
    4: 'text-base font-medium mt-4 mb-2 text-foreground scroll-mt-20',
    5: 'text-sm font-medium mt-3 mb-1 text-foreground scroll-mt-20',
    6: 'text-xs font-medium mt-2 mb-1 text-muted-foreground scroll-mt-20',
  }

  const H = `h${level}` as React.ElementType

  return (
    <H id={id} className={sizes[level]}>
      <a href={`#${id}`} className="hover:underline decoration-dotted decoration-muted-foreground/30">
        {children}
      </a>
    </H>
  )
}

function Anchor({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  const isExternal = href?.startsWith('http')
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="text-primary hover:underline font-medium"
      {...props}
    >
      {children}
    </a>
  )
}

function List({ ordered, children }: { ordered?: boolean; children: React.ReactNode }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={`my-3 ${ordered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1.5 text-muted-foreground`}>
      {children}
    </Tag>
  )
}

function ListItem({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="my-3 leading-relaxed text-muted-foreground">{children}</p>
}

function Blockquote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-4 border-primary/30 pl-4 my-4 py-2 bg-muted/30 rounded-r-lg text-muted-foreground italic">
      {children}
    </blockquote>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>
}

function Emphasis({ children }: { children: React.ReactNode }) {
  return <em className="italic">{children}</em>
}

function Divider() {
  return <hr className="my-8 border-border/50" />
}

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock as any,
          table: Table as any,
          thead: TableHead as any,
          th: TableHeader as any,
          tr: TableRow as any,
          td: TableCell as any,
          h1: ({ children }) => <Heading level={1}>{children}</Heading>,
          h2: ({ children }) => <Heading level={2}>{children}</Heading>,
          h3: ({ children }) => <Heading level={3}>{children}</Heading>,
          h4: ({ children }) => <Heading level={4}>{children}</Heading>,
          h5: ({ children }) => <Heading level={5}>{children}</Heading>,
          h6: ({ children }) => <Heading level={6}>{children}</Heading>,
          a: Anchor as any,
          ul: ({ children }) => <List>{children}</List>,
          ol: ({ children }) => <List ordered>{children}</List>,
          li: ListItem as any,
          p: Paragraph as any,
          blockquote: Blockquote as any,
          strong: Strong as any,
          em: Emphasis as any,
          hr: Divider as any,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
