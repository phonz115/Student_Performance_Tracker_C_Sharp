import { createContext } from 'react';
import type { AppUser, Grade, GradePayload, GradeUpdatePayload, MessageResponse, TeacherAssignment, UserRole } from '../types';

export type AuthContextValue = {
  user: AppUser | null;
  users: AppUser[];
  grades: Grade[];
  teacherAssignments: TeacherAssignment[];
  loading: boolean;
  error: string;
  login: (identifier: string, password: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  addGrade: (gradeData: GradePayload) => Promise<Grade>;
  editGrade: (gradeId: number, gradeData: GradeUpdatePayload) => Promise<Grade>;
  deleteGrade: (gradeId: number) => Promise<void>;
  requestPasswordReset: (identifier: string, role: UserRole) => Promise<MessageResponse>;
  reloadData: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
