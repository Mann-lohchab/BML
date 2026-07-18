import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Copy, Eye, EyeOff, Gauge, Radar, ShieldCheck, TrainFront } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Brand, Button, Field } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const demoEmail = 'admin@bml.local';
  const demoPassword = 'bmladmin123';

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  }

  function useDemoCredentials() {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
  }

  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-story__content">
          <p className="eyebrow">Rail operations, in one signal</p>
          <h1>See every coach.<br />Act on every event.</h1>
          <p>
            BML turns live wheel-slide telemetry into a clear operating picture for fleet,
            alerts, shelling analysis, and reporting.
          </p>
          <div className="auth-story__features">
            <div><Radar size={18} /><span>Live telemetry</span></div>
            <div><ShieldCheck size={18} /><span>Role-protected access</span></div>
            <div><Gauge size={18} /><span>Axle analytics</span></div>
          </div>
        </div>
        <div className="auth-story__rail" aria-hidden="true">
          <span /><span /><span /><span /><span />
          <TrainFront size={30} />
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form__mobile-brand"><Brand /></div>
          <div>
            <p className="eyebrow">Secure access</p>
            <h2>Welcome to BML</h2>
            <p>Sign in with your operations account.</p>
          </div>
          <button className="demo-access" type="button" onClick={useDemoCredentials}>
            <span className="demo-access__icon"><Copy size={15} /></span>
            <span>
              <strong>Use demo access</strong>
              <small>ID: {demoEmail} · Pass: {demoPassword}</small>
            </span>
          </button>
          {error && <div className="form-alert">{error}</div>}
          <Field label="Email address">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={demoEmail}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password">
            <span className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                minLength={8}
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </Field>
          <div className="auth-form__options">
            <span />
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in' : 'Sign in'}
            {!submitting && <ArrowRight size={17} />}
          </Button>
          <small className="auth-form__security">JWT-secured session · BML operations network</small>
        </form>
      </section>
    </div>
  );
}
