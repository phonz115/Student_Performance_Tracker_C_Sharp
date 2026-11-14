import RoleLogin from './RoleLogin';

const AdminLogin = () => (
  <RoleLogin
    role="admin"
    headerTitle="ClassIQ"
    title="Admin Login"
    subtitle="Access the administration panel"
    identifierLabel="Email Address"
    identifierPlaceholder="Enter your email address"
    identifierType="email"
    invalidMessage="Invalid Email Address or Password"
    missingIdentifierMessage="Enter your email address first, then request a password reset."
    normalizeIdentifier={(value) => value.trim().toLowerCase()}
  />
);

export default AdminLogin;
