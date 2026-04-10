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
  financeiro: '💰',
  risco: '⚠️',
  operacional: '⚙️',
}

export default function InsightsPanel({ insights = [], dark = false }) {
  const cardBg = dark ? '#0d1a26' : '#ffffff'
  const border = dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const titleColor = dark ? '#2e5c8a' : '#1d4ed8'
  const textColor = dark ? '#d9e2ec' : '#1e293b'
  const bodyColor = dark ? '#7f9ab5' : '#64748b'
  const emptyColor = dark ? '#486581' : '#94a3b8'

  if (!insights.length) {
    return (
      <div
        style={{
          margin: '16px 0',
          padding: '14px 18px',
          background: cardBg,
          border: `1px solid ${border}`,
          borderRadius: 9,
          fontSize: 13,
          color: emptyColor,
        }}
      >
        Não foram identificados pontos críticos nos dados analisados.
      </div>
    )
  }

  return (
    <div
      style={{
        margin: '16px 0',
        background: cardBg,
        border: `1px solid ${border}`,
        borderRadius: 9,
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
        🚨 Insights Automáticos
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
                background: dark ? '#102132' : '#f8fafc',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                {TYPE_ICONS[type] || '📊'}
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
