import { useEffect, useState, type ReactNode } from 'react';
import { createGrade, deleteGrade as deleteGradeService, getGrades, updateGrade } from '../services/gradeService';
import { getUsers } from '../services/userService';
import { getSession, loginUser, logoutUser, requestPasswordReset as requestPasswordResetService } from '../services/authService';
import { getTeacherAssignments } from '../services/adminService';
import type { AppUser, Grade, GradePayload, GradeUpdatePayload, TeacherAssignment, UserRole } from '../types';
import { AuthContext } from './authContext';

type AuthProviderProps = {
  children: ReactNode;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error && error.message ? error.message : fallback;
};

const isUnauthorizedSession = (error: unknown) => {
  return error instanceof Error && error.message === 'Unauthorized';
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAppData = async () => {
    try {
      setLoading(true);
      setError('');

      const sessionUser = await getSession();
      setUser(sessionUser);

      const [usersData, gradesData, assignmentData] = await Promise.all([
        getUsers(),
        getGrades(),
        getTeacherAssignments().catch(() => []),
      ]);

      setUsers(usersData);
      setGrades(gradesData);
      setTeacherAssignments(assignmentData);
    } catch (err) {
      setError(isUnauthorizedSession(err) ? '' : getErrorMessage(err, 'Unable to connect to the server'));
      setUser(null);
      setUsers([]);
      setGrades([]);
      setTeacherAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppData();
  }, []);

  const login = async (identifier: string, password: string, role: UserRole) => {
    try {
      const loggedInUser = await loginUser({ identifier, password, role });
      setUser(loggedInUser);
      await loadAppData();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to reach the server'));
      return false;
    }
  };

  const addGrade = async (gradeData: GradePayload) => {
    const savedGrade = await createGrade(gradeData);
    setGrades((currentGrades) => [savedGrade, ...currentGrades]);
    return savedGrade;
  };

  const editGrade = async (gradeId: number, gradeData: GradeUpdatePayload) => {
    const savedGrade = await updateGrade(gradeId, gradeData);
    setGrades((currentGrades) => currentGrades.map((grade) => (grade.id === savedGrade.id ? savedGrade : grade)));
    return savedGrade;
  };

  const deleteGrade = async (gradeId: number) => {
    await deleteGradeService(gradeId);
    setGrades((currentGrades) => currentGrades.filter((grade) => grade.id !== gradeId));
  };

  const requestPasswordReset = async (identifier: string, role: UserRole) => {
    return requestPasswordResetService({ identifier, role });
  };

  const logout = () => {
    logoutUser().catch(() => undefined);

    setUser(null);
    setUsers([]);
    setGrades([]);
    setTeacherAssignments([]);
  };

  return (
    <AuthContext.Provider
      value={{ user, users, grades, teacherAssignments, loading, error, login, logout, addGrade, editGrade, deleteGrade, requestPasswordReset, reloadData: loadAppData }}
    >
      {children}
    </AuthContext.Provider>
  );
};
