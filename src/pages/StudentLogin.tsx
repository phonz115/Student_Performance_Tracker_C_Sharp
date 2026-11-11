import RoleLogin from './RoleLogin';

const StudentLogin = () => (
  <RoleLogin
    role="student"
    headerTitle="Student Login - Performance Tracker"
    title="Student Login"
    subtitle="Enter your credentials to access your account"
    identifierLabel="ID Number"
    identifierPlaceholder="Enter your ID number"
    identifierType="text"
    invalidMessage="Invalid ID Number or Password"
    missingIdentifierMessage="Enter your ID number first, then request a password reset."
  />
);

export default StudentLogin;
