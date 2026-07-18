import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { Link } from 'react-router';
import { Brand, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email }, { authenticated: false });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="simple-auth">
      <div className="simple-auth__brand"><Brand /></div>
      <form className="auth-form simple-auth__card" onSubmit={handleSubmit}>
        {sent ? (
          <>
            <span className="simple-auth__success"><CheckCircle2 size={28} /></span>
            <div>
              <h2>Request received</h2>
              <p>If an active account matches {email}, the reset workflow has been started.</p>
            </div>
            <Link className="button button--secondary button--md" to="/login">
              <ArrowLeft size={16} />Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">Account recovery</p>
              <h2>Forgot your password?</h2>
              <p>Enter your work email to begin the recovery process.</p>
            </div>
            {error && <div className="form-alert">{error}</div>}
            <Field label="Email address">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Button type="submit" disabled={submitting}>
              <Send size={16} />{submitting ? 'Submitting' : 'Send request'}
            </Button>
            <Link className="text-link" to="/login"><ArrowLeft size={14} />Back to sign in</Link>
          </>
        )}
      </form>
    </div>
  );
}
