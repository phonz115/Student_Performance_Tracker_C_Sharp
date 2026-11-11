import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './hooks/useAuth';
import { LoadingSpinner } from './components/ui';
import './App.css';

import Dashboard from './pages/Dashboard';
import StudentGrades from './pages/StudentGrades';
import AddGrades from './pages/admin/AddGrades';
import ManageUsers from './pages/admin/ManageUsers';
import StudentLogin from './pages/StudentLogin';
import AdminLogin from './pages/AdminLogin';
import TeacherLogin from './pages/TeacherLogin';
import Sidebar from './components/Sidebar';
import StudentHeader from './components/StudentHeader';

const AppRoutes = () => {
  const { user, loading, error, reloadData } = useAuth();

  if (loading) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <LoadingSpinner label="Loading account data" />
        <span>Loading your account data...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/student" element={<StudentLogin />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/teacher" element={<TeacherLogin />} />
        <Route
          path="/"
          element={error ? (
            <div className="app-error-state">
              <p className="app-error-text" role="alert">
                We could not load your account data. Please check that the server is running, then try again.
              </p>
              <button type="button" className="login-btn" onClick={reloadData}>
                Retry
              </button>
            </div>
          ) : <Navigate to="/student" />}
        />
        <Route path="*" element={<Navigate to="/student" />} />
      </Routes>
    );
  }

  return (
    <div className={`app-shell app-shell-${user.role}`}>
      {user.role === 'admin' ? <Sidebar /> : <StudentHeader />}
      <main className="app-main">
        <Routes>
          <Route path="/dashboard" element={user?.role === 'admin' ? <Dashboard /> : <Navigate to="/add-grades" replace />} />
          <Route path="/add-grades" element={user?.role === 'student' ? <StudentGrades /> : <AddGrades />} />
          <Route path="/grades-management" element={<Navigate to="/add-grades" replace />} />
          <Route path="/manage-users" element={user?.role === 'admin' ? <ManageUsers /> : <Navigate to="/dashboard" />} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <AppRoutes />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
