import { useState, useEffect } from "react"

interface HeaderProps {
  tenantName: string
  userName: string
}

export function Header({ tenantName, userName }: HeaderProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="header">
      <div className="header-left">
        <div className="brand">
          <div className="brand-icon">TG</div>
          <span>TakeasyGO</span>
        </div>
        <div className="header-divider" />
        <div className="header-info">
          <span>📍 {tenantName}</span>
          <span className="header-divider" />
          <span>
            🕐{" "}
            {time.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <div className="header-right">
        <div className="sync-status">
          <div className="sync-dot" />
          <span>Sincronizado</span>
        </div>
        <div className="header-avatar" title={userName}>
          {initials}
        </div>
      </div>
    </header>
  )
}
