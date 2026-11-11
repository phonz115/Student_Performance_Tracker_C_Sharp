import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { formatName } from '../utils/formatName';

const StudentHeader = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const fallbackName = user?.role === 'teacher' ? 'Teacher' : 'Student';

  return (
    <header className="student-header">
      <div className="student-header-brand">ClassIQ</div>
      <div className="student-header-account">
        <span className="student-header-name">{formatName(user?.name) || fallbackName}</span>
        <button type="button" className="student-header-logout" onClick={handleLogout}>Logout</button>
      </div>
    </header>
  );
};

export default StudentHeader;
