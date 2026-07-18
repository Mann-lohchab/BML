import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Brand, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, password }, { authenticated: false });
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="simple-auth">
      <div className="simple-auth__brand"><Brand /></div>
      <form className="auth-form simple-auth__card" onSubmit={handleSubmit}>
        {complete ? (
          <>
            <span className="simple-auth__success"><CheckCircle2 size={28} /></span>
            <div><h2>Request completed</h2><p>Your password reset request was accepted by BML.</p></div>
            <Link className="button button--primary button--md" to="/login"><ArrowLeft size={16} />Return to sign in</Link>
          </>
        ) : (
          <>
            <span className="simple-auth__success simple-auth__success--key"><KeyRound size={25} /></span>
            <div><p className="eyebrow">Secure recovery</p><h2>Set a new password</h2><p>Enter your recovery token and choose a password of at least eight characters.</p></div>
            {error && <div className="form-alert">{error}</div>}
            <Field label="Recovery token"><input value={token} onChange={(event) => setToken(event.target.value)} required /></Field>
            <Field label="New password"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></Field>
            <Field label="Confirm password"><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required /></Field>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting' : 'Reset password'}</Button>
            <Link className="text-link" to="/login"><ArrowLeft size={14} />Back to sign in</Link>
          </>
        )}
      </form>
    </div>
  );
}
