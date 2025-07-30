import React from 'react'

interface CalloutProps {
  type?: 'note' | 'warning' | 'error' | 'info'
  title?: string
  children: React.ReactNode
}

const typeStyles = {
  note: {
    background: 'rgba(3, 102, 214, 0.05)',
    border: 'rgba(3, 102, 214, 0.2)',
    color: '#0366d6',
    icon: 'ℹ️'
  },
  warning: {
    background: 'rgba(255, 211, 61, 0.05)',
    border: 'rgba(255, 211, 61, 0.2)',
    color: '#b08800',
    icon: '⚠️'
  },
  error: {
    background: 'rgba(215, 58, 73, 0.05)',
    border: 'rgba(215, 58, 73, 0.2)',
    color: '#d73a49',
    icon: '⛔'
  },
  info: {
    background: 'rgba(111, 66, 193, 0.05)',
    border: 'rgba(111, 66, 193, 0.2)',
    color: '#6f42c1',
    icon: '💡'
  }
}

export function Callout({ type = 'note', title, children }: CalloutProps) {
  const style = typeStyles[type]
  
  return (
    <div 
      className="my-6 rounded-lg p-4"
      style={{
        backgroundColor: style.background,
        border: `1px solid ${style.border}`,
      }}
    >
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <span>{style.icon}</span>
          <span className="font-semibold" style={{ color: style.color }}>
            {title}
          </span>
        </div>
      )}
      <div className="callout-content" style={{ color: 'var(--markdoc-gray-700)' }}>
        {children}
      </div>
    </div>
  )
}