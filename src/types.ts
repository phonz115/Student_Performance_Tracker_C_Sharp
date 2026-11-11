export type UserRole = 'admin' | 'teacher' | 'student';

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  course?: string;
  schoolYear?: string;
  semester?: string;
};

export type Grade = {
  id: number;
  studentId: string;
  subject: string;
  score: number;
  feedback: string;
  teacherId?: string | null;
  schoolYear?: string;
  semester?: string;
  term?: string;
};

export type GradePayload = {
  studentId: string;
  subject: string;
  score: number;
  feedback?: string;
  schoolYear?: string;
  semester?: string;
  term?: string;
};

export type GradeUpdatePayload = {
  subject: string;
  score: number;
  feedback?: string;
  schoolYear?: string;
  semester?: string;
  term?: string;
};

export type LoginPayload = {
  identifier: string;
  password: string;
  role: UserRole;
};

export type PasswordResetPayload = {
  identifier: string;
  role: UserRole;
};

export type MessageResponse = {
  message: string;
};

export type TeacherAssignment = {
  id?: number;
  teacherId: string;
  studentId: string;
  subject: string;
  course?: string;
  section?: string;
  schoolYear?: string;
  semester?: string;
};

export type Course = {
  id?: number;
  code: string;
  name: string;
  description?: string;
  schoolYear?: string;
  semester?: string;
  teacherId?: string | null;
};

export type Subject = {
  id?: number;
  name: string;
  teacherId: string;
};
