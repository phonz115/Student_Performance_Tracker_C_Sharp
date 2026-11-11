import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { getBackup, restoreBackup } from '../services/adminService';
import './Dashboard.css';

const Dashboard = () => {
  const { user, grades, users, reloadData } = useAuth();
  const navigate = useNavigate();
  const { success, error } = useNotifications();
  const restoreInput = useRef(null);
  const [isWorking, setIsWorking] = useState(false);

  const downloadBackup = async () => {
    try {
      setIsWorking(true);
      const backup = await getBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `classiq-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      success('Backup downloaded.');
    } catch (requestError) {
      error(requestError instanceof Error ? requestError.message : 'Backup could not be downloaded.');
    } finally {
      setIsWorking(false);
    }
  };

  const restoreFromFile = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
        throw new Error('Choose a valid ClassIQ JSON backup file.');
      }
      if (!window.confirm('Restore this backup? It will replace the current system data.')) return;

      setIsWorking(true);
      const result = await restoreBackup(backup);
      await reloadData();
      success(result.message || 'Backup restored.');
    } catch (requestError) {
      error(requestError instanceof Error ? requestError.message : 'Backup could not be restored.');
    } finally {
      setIsWorking(false);
      event.target.value = '';
    }
  };

  if (user.role === 'admin') {
    const students = users.filter((account) => account.role === 'student').length;
    const teachers = users.filter((account) => account.role === 'teacher').length;

    return (
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <h1>Admin dashboard</h1>
          </div>
        </header>

        <section className="dashboard-summary" aria-label="System summary">
          <article><span>Students</span><strong>{students}</strong></article>
          <article><span>Teachers</span><strong>{teachers}</strong></article>
          <article><span>Grade records</span><strong>{grades.length}</strong></article>
        </section>

        <section className="dashboard-section">
          <h2>Management</h2>
          <div className="dashboard-links">
            <button type="button" onClick={() => navigate('/add-grades')}>View all grades</button>
            <button type="button" onClick={() => navigate('/manage-users#users')}>Manage users</button>
            <button type="button" onClick={() => navigate('/manage-users#courses')}>Manage courses &amp; subjects</button>
          </div>
        </section>

        <section className="dashboard-section system-data-section">
          <h2>System data</h2>

          <div className="dashboard-links">
            <button type="button" onClick={downloadBackup} disabled={isWorking}>
              {isWorking ? 'Working…' : 'Download backup'}
            </button>
            <button type="button" className="secondary" onClick={() => restoreInput.current?.click()} disabled={isWorking}>
              Restore backup
            </button>
            <input ref={restoreInput} type="file" accept="application/json,.json" onChange={restoreFromFile} hidden />
          </div>
        </section>
      </div>
    );
  }



  return null;
};

export default Dashboard;
