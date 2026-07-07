import { useLayout } from "./LayoutContext"

export function ActionBar() {
  const { actionBar } = useLayout()

  if (!actionBar) {
    return <footer className="action-bar action-bar--empty" />
  }

  return (
    <footer className="action-bar">
      <div className="action-bar-left">{actionBar.left}</div>
      <div className="action-bar-center">{actionBar.center}</div>
      <div className="action-bar-right">{actionBar.right}</div>
    </footer>
  )
}
