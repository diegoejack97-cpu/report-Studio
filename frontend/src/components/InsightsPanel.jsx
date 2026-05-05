const SEVERITY_STYLES = {
  alta: {
    border: '#ef4444',
    badgeBg: 'rgba(239,68,68,0.15)',
    badgeTxt: '#f87171',
  },
  media: {
    border: '#f59e0b',
    badgeBg: 'rgba(245,158,11,0.15)',
    badgeTxt: '#fbbf24',
  },
  baixa: {
    border: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.15)',
    badgeTxt: '#60a5fa',
  },
}

const TYPE_ICONS = {
  financeiro: DollarSign,
  risco: AlertTriangle,
  operacional: Settings2,
}

export default function InsightsPanel({ insights = [], dark = false }) {
  const border = dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const titleColor = dark ? '#2e5c8a' : '#1d4ed8'
  const textColor = dark ? '#d9e2ec' : '#1e293b'
  const bodyColor = dark ? '#7f9ab5' : '#64748b'
  const emptyColor = dark ? '#486581' : '#94a3b8'

  if (!insights.length) {
    return (
      <div
        className="rf-panel"
        style={{
          margin: '16px 0',
          padding: '16px 18px',
          fontSize: 13,
          color: emptyColor,
        }}
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={16} />
          <span>Não foram identificados pontos críticos nos dados analisados.</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rf-panel-strong"
      style={{
        margin: '16px 0',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${border}`,
          fontSize: 12,
          fontWeight: 700,
          color: titleColor,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
        }}
      >
        <span className="inline-flex items-center gap-2">
          <SparklesIcon />
          Insights Automáticos
        </span>
      </div>
      <div style={{ padding: '12px 16px' }}>
        {insights.map((insight, index) => {
          const severity = insight.severidade || 'baixa'
          const type = insight.tipo || 'operacional'
          const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.baixa

          return (
            <div
              key={`${insight.titulo || 'insight'}-${index}`}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '10px 14px',
                marginBottom: index === insights.length - 1 ? 0 : 8,
                borderLeft: `3px solid ${styles.border}`,
                background: dark ? 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0)), #102132' : 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.72)), #f8fafc',
                borderRadius: '0 10px 10px 0',
                borderTop: `1px solid ${border}`,
                borderRight: `1px solid ${border}`,
                borderBottom: `1px solid ${border}`,
                boxShadow: 'var(--elev-1)',
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
                {(() => {
                  const Icon = TYPE_ICONS[type] || BarChart3
                  return <Icon size={16} />
                })()}
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: textColor }}>
                    {insight.titulo}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '1px 7px',
                      borderRadius: 999,
                      background: styles.badgeBg,
                      color: styles.badgeTxt,
                    }}
                  >
                    {severity.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: bodyColor, lineHeight: 1.5 }}>
                  {insight.descricao}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
function SparklesIcon() {
  return <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]" />
}

import { AlertTriangle, BarChart3, DollarSign, Settings2 } from 'lucide-react'
