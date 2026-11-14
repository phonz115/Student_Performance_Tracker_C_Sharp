import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Layout from '../components/Layout';
import studentIcons from '../assets/icon-transparent.png';
import { confirmPasswordReset } from '../services/authService';
import './ResetPassword.css';

const allowedRoles = new Set(['admin', 'teacher', 'student']);

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const requestedRole = searchParams.get('role') || '';
  const role = allowedRoles.has(requestedRole) ? requestedRole : 'student';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset({ token, password, confirmPassword });
      setComplete(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'We could not reset your password. Request a new link and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Header title="ClassIQ" />
      <Layout leftImage={studentIcons} showImage>
        <main className="reset-password-page">
          <section className="reset-password-card">
            {complete ? (
              <>
                <h1>Password changed</h1>
                <p>Your password has been reset. You can now sign in with your new password.</p>
                <button type="button" className="reset-password-primary" onClick={() => window.location.assign('/' + role)}>
                  Go to login
                </button>
              </>
            ) : (
              <>
                <h1>Reset your password</h1>
                <p>Choose a new password for your ClassIQ account. This one-time link expires in 20 minutes.</p>
                {!token ? (
                  <>
                    <div className="reset-password-error" role="alert">This reset link is missing or invalid. Request a new one from the login page.</div>
                    <button type="button" className="reset-password-secondary" onClick={() => navigate('/' + role)}>
                      Back to login
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleSubmit} className="reset-password-form">
                    <label htmlFor="new-password">New password</label>
                    <input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                    <label htmlFor="confirm-password">Confirm new password</label>
                    <input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                    <p className="reset-password-hint">Use at least 8 characters, including an uppercase letter, a number, and a special character.</p>
                    {error && <div className="reset-password-error" role="alert">{error}</div>}
                    <button type="submit" className="reset-password-primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving password...' : 'Change password'}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        </main>
      </Layout>
    </>
  );
};

export default ResetPassword;
