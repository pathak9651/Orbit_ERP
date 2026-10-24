/** Presents the shared sign-in and account-request form. */
export default function AuthScreen({ mode, onModeChange, onSubmit, error, notice, busy, resetToken }) {
  const isSignUp = mode === 'signup'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const isRecovery = isForgot || isReset
  const title = isSignUp ? 'Create your account' : isForgot ? 'Reset your password' : isReset ? 'Choose a new password' : 'Sign in to Orbit'

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="About Orbit ERP">
        <a className="brand" href="#home" aria-label="Orbit ERP home">
          <span className="brand-mark">o</span><span>orbit<span className="brand-muted">ERP</span></span>
        </a>
        <div className="story-copy">
          <span className="eyebrow">YOUR BUSINESS, IN ORBIT</span>
          <h1>Make space<br />for what’s next.</h1>
          <p>One clear view of the work, people, and decisions that move your business forward.</p>
        </div>
        <div className="story-footnote"><span className="status-dot" /> A calmer way to run your business</div>
        <div className="orbit-art" aria-hidden="true"><i /><i /><i /><b /></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <a className="brand mobile-brand" href="#home" aria-label="Orbit ERP home">
            <span className="brand-mark">o</span><span>orbit<span className="brand-muted">ERP</span></span>
          </a>
          <span className="eyebrow">{isSignUp ? 'GET STARTED' : isRecovery ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</span>
          <h2>{title}</h2>
          <p className="auth-description">
            {isSignUp ? 'Set up your workspace and bring your business into focus.' : isForgot ? 'Enter your account email to receive reset instructions.' : isReset ? 'Choose a unique password with at least 8 characters.' : 'Enter your details to access your workspace.'}
          </p>

          <form className="auth-form" onSubmit={onSubmit}>
            {isSignUp && (
              <label className="field-label">
                Your name
                <input name="name" autoComplete="name" placeholder="Alex Morgan" minLength="2" maxLength="80" required />
              </label>
            )}
            {!isReset && !isForgot && <label className="field-label">
              Email address
              <input name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
            </label>}
            {!isForgot && !isReset && <label className="field-label">
              Password
              <input name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="At least 8 characters" minLength={isSignUp ? 8 : undefined} maxLength="72" required />
            </label>}
            {isForgot && <label className="field-label">Email address<input name="email" type="email" autoComplete="email" required /></label>}
            {isReset && <><input type="hidden" name="token" value={resetToken || ''} /><label className="field-label">New password<input name="newPassword" type="password" autoComplete="new-password" minLength="8" maxLength="72" required /></label><label className="field-label">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" maxLength="72" required /></label></>}

            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait' : isSignUp ? 'Create account' : isForgot ? 'Send reset instructions' : isReset ? 'Reset password' : 'Sign in'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          {mode === 'login' && <p className="auth-switch"><button type="button" onClick={() => onModeChange('forgot')}>Forgot password?</button></p>}
          {(isForgot || isReset) && <p className="auth-switch"><button type="button" onClick={() => onModeChange('login')}>Back to sign in</button></p>}
          {!isRecovery && <p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Orbit?'}<button type="button" onClick={() => onModeChange(isSignUp ? 'login' : 'signup')}>{isSignUp ? 'Sign in' : 'Create an account'}</button></p>}
        </div>
        <footer className="auth-footer">© {new Date().getFullYear()} Orbit ERP <span>·</span> Built for the way you work</footer>
      </section>
    </main>
  )
}


