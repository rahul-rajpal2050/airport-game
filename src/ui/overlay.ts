import type { CSSProperties } from 'react'

export const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  background: 'rgba(10, 14, 26, 0.88)',
  color: '#e2e8f0',
  fontFamily: 'monospace',
  textAlign: 'center',
}

export const buttonStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 18,
  fontWeight: 'bold',
  padding: '12px 32px',
  background: '#4ade80',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}
