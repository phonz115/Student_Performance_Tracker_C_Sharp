import RoleLogin from './RoleLogin';

const TeacherLogin = () => (
  <RoleLogin
    role="teacher"
    headerTitle="ClassIQ"
    title="Teacher Login"
    subtitle="Enter your credentials to access your account"
    identifierLabel="Email Address"
    identifierPlaceholder="Enter your email address"
    identifierType="email"
    invalidMessage="Invalid Email Address or Password"
    missingIdentifierMessage="Enter your email address first, then request a password reset."
    normalizeIdentifier={(value) => value.trim().toLowerCase()}
  />
);

export default TeacherLogin;
