import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { formatName } from '../utils/formatName';

const userSections = [
  { to: '/manage-users#teachers', label: 'Teachers', hash: '#teachers' },
  { to: '/manage-users#students', label: 'Students', hash: '#students' },
  { to: '/manage-users#admins', label: 'Admins', hash: '#admins' },
];

const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = formatName(user?.name) || 'User';
  const isManageUsersRoute = location.pathname === '/manage-users';
  const isUsersSectionActive = isManageUsersRoute && location.hash !== '#courses';

  const navItems = user?.role === 'admin'
    ? [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/add-grades', label: 'All Grades' },
      { to: '/manage-users#users', label: 'Users', hash: '#users' },
      { to: '/manage-users#courses', label: 'Courses & Subjects', hash: '#courses' },
    ]
    : [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/add-grades', label: 'Grades' },
    ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>ClassIQ</h1>
      </div>

      <div className="sidebar-profile">
        <div className="sidebar-profile-info">
          <p className="sidebar-name">{displayName}</p>
          <p className="sidebar-id">{user?.role || 'User'}</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navItems.map((item) => {
          const isUsersParent = item.hash === '#users';
          return (
            <div key={item.to} className="sidebar-nav-item">
              <NavLink
                to={item.to}
                end={!item.hash}
                className={({ isActive }) => {
                  const active = isUsersParent
                    ? isUsersSectionActive
                    : item.hash
                      ? location.hash === item.hash
                      : isActive;
                  return `sidebar-link${active ? ' active' : ''}`;
                }}
              >
                {item.label}
              </NavLink>
              {isUsersParent && isUsersSectionActive && (
                <div className="sidebar-subnav" aria-label="User categories">
                  {userSections.map((section) => (
                    <NavLink
                      key={section.hash}
                      to={section.to}
                      className="sidebar-subnav-link"
                    >
                      <span className="sidebar-subnav-plus" aria-hidden="true">+</span>
                      {section.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button type="button" className="sidebar-logout" onClick={handleLogout}>
        Logout
      </button>
    </aside>
  );
};

export default Sidebar;
