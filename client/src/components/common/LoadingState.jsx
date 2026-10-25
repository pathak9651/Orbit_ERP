import orbitLogo from '../../assets/orbit-logo.svg'

/** Shows the shared Orbit loading animation with an accessible status label. */
export default function LoadingState({ label = 'Loading', size = 'compact', inline = false }) {
  const StatusElement = inline ? 'span' : 'div'
  return <StatusElement className={`loading-state loading-state-${size}${inline ? ' loading-state-inline' : ''}`} role="status" aria-label={label}>
    <span className="loading-orbit-mark" aria-hidden="true"><img src={orbitLogo} alt="" /></span>
    <span className="loading-state-label">{label}</span>
    {!inline && <span className="loading-progress-track" aria-hidden="true"><span /></span>}
  </StatusElement>
}
