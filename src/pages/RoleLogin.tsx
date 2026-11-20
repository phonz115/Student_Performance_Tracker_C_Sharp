import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Layout from '../components/Layout';
import { LoadingSpinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useStatusToast } from '../hooks/useNotifications';
import studentIcons from '../assets/icon-transparent.png';
import type { UserRole } from '../types';

type RoleLoginProps = {
  role: UserRole;
  headerTitle: string;
  title: string;
  subtitle: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  identifierType: 'email' | 'text';
  invalidMessage: string;
  missingIdentifierMessage: string;
  normalizeIdentifier?: (value: string) => string;
};

const eyeIconProps = {
  width: '26',
  height: '26',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#6b7280',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const VisiblePasswordIcon = () => (
  <svg {...eyeIconProps}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const HiddenPasswordIcon = () => (
  <svg {...eyeIconProps}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error && error.message ? error.message : fallback;
};

const RoleLogin = ({
  role,
  headerTitle,
  title,
  subtitle,
  identifierLabel,
  identifierPlaceholder,
  identifierType,
  invalidMessage,
  missingIdentifierMessage,
  normalizeIdentifier = (value) => value.trim(),
}: RoleLoginProps) => {
  const { login, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  useStatusToast(error, 'error', 'Login issue');
  useStatusToast(successMessage, 'success', 'Password reset');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const success = await login(normalizeIdentifier(identifier), password, role);

      if (!success) {
        setError(invalidMessage);
        return;
      }

      navigate(role === 'student' ? '/add-grades' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, invalidMessage));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    setError('');
    setSuccessMessage('');

    if (!normalizedIdentifier) {
      setError(missingIdentifierMessage);
      return;
    }

    try {
      setIsResetting(true);
      await requestPasswordReset(normalizedIdentifier, role);
      setSuccessMessage('If the account exists, a reset link was sent to its registered email. Check the inbox or spam folder. The link expires in 20 minutes.');
    } catch (err) {
      setError(getErrorMessage(err, 'We could not start the password reset. Check your details and try again.'));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Header title={headerTitle} className="login-page-header" />
      <Layout leftImage={studentIcons} showImage>
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.header}>
              <h2 style={styles.title}>{title}</h2>
              <p style={styles.subtitle}>{subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} style={styles.form} aria-busy={isSubmitting}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>{identifierLabel}</label>
                <input
                  type={identifierType}
                  placeholder={identifierPlaceholder}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <div style={styles.passwordWrapper}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    style={styles.passwordInput}
                  />

                  {password.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPassword((currentValue) => !currentValue)}
                      style={styles.eyeIconButton}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisiblePasswordIcon /> : <HiddenPasswordIcon />}
                    </button>
                  )}
                </div>
              </div>

              <button type="button" className="forgot-btn" onClick={handleForgotPassword} style={styles.forgotButton} disabled={isResetting || isSubmitting}>
                <span className="button-content">
                  {isResetting && <LoadingSpinner label="Requesting password reset" size="small" />}
                  Forgot Password?
                </span>
              </button>

              <button type="submit" style={styles.button} disabled={isSubmitting || isResetting}>
                <span className="button-content">
                  {isSubmitting && <LoadingSpinner label="Signing in" size="small" />}
                  {isSubmitting ? 'Signing in...' : 'Log In'}
                </span>
              </button>

            </form>
          </div>
        </div>
      </Layout>
    </>
  );
};

const styles: Record<string, CSSProperties> = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' },
  card: { background: 'white', padding: '40px 36px', borderRadius: '20px', boxShadow: '0 18px 40px rgba(15,23,42,0.08)', width: '100%', maxWidth: '480px', boxSizing: 'border-box' },
  header: { textAlign: 'center', marginBottom: '24px' },
  title: { margin: '0', fontSize: '28px', color: '#111827', fontWeight: '700', lineHeight: '1.15' },
  subtitle: { color: '#4b5563', fontSize: '15px', marginTop: '8px', lineHeight: '1.35' },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '15px', fontWeight: '500', color: '#1f2937' },
  input: { minHeight: '50px', padding: '0 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '12px', fontSize: '16px', outline: 'none', color: '#111827', caretColor: '#111827', WebkitTextFillColor: '#111827', boxSizing: 'border-box' },
  passwordWrapper: { position: 'relative', width: '100%' },
  passwordInput: { width: '100%', minHeight: '50px', padding: '0 52px 0 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '12px', fontSize: '16px', outline: 'none', boxSizing: 'border-box', color: '#111827', caretColor: '#111827', WebkitTextFillColor: '#111827' },
  eyeIconButton: { position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex', border: 'none', background: 'transparent', padding: '4px' },
  formOptions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', fontSize: '16px' },
  forgotButton: { alignSelf: 'flex-end', background: 'transparent', border: 'none', color: 'var(--primary, #315d9b)', cursor: 'pointer', fontSize: '14px', fontWeight: '500', padding: '0' },
  button: { minHeight: '50px', padding: '0 16px', borderRadius: '12px', border: 'none', background: 'var(--primary, #315d9b)', color: 'white', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' },
  errorBox: { color: '#b91c1c', backgroundColor: '#fef2f2', padding: '14px', borderRadius: '10px', textAlign: 'center', marginBottom: '18px', border: '1px solid #fecaca', fontSize: '15px' },
};

export default RoleLogin;
