import type { AppUser, Course, Subject, TeacherAssignment } from '../types';
import { apiPost, apiRequest } from './apiClient';

export type UserPayload = {
  id: string;
  name: string;
  email: string;
  role: AppUser['role'];
  password?: string;
  course?: string;
  schoolYear?: string;
  semester?: string;
};

export const createUser = (userData: UserPayload & { password: string }) => {
  return apiPost<AppUser, UserPayload & { password: string }>('/users', userData);
};

export const updateUser = (userId: string, userData: Omit<UserPayload, 'id' | 'password'>) => {
  return apiRequest<AppUser>(`/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(userData),
  });
};

export const deleteUser = (userId: string) => {
  return apiRequest<{ ok: boolean }>(`/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
};

export const resetUserPassword = (userId: string, password: string) => {
  return apiPost<{ message: string }, { password: string }>(`/users/${encodeURIComponent(userId)}/reset-password`, { password });
};

export const getTeacherAssignments = () => apiRequest<TeacherAssignment[]>('/teacher-assignments');

export const createTeacherAssignment = (assignment: TeacherAssignment) => {
  return apiPost<TeacherAssignment, TeacherAssignment>('/teacher-assignments', assignment);
};

export const deleteTeacherAssignment = (assignmentId: number) => {
  return apiRequest<{ ok: boolean }>(`/teacher-assignments/${assignmentId}`, {
    method: 'DELETE',
  });
};

export const getCourses = () => apiRequest<Course[]>('/courses');

export const createCourse = (course: Course) => {
  return apiPost<Course, Course>('/courses', course);
};

export const updateCourse = (courseId: number, course: Course) => {
  return apiRequest<Course>(`/courses/${courseId}`, {
    method: 'PUT',
    body: JSON.stringify(course),
  });
};

export const deleteCourse = (courseId: number) => {
  return apiRequest<{ ok: boolean }>(`/courses/${courseId}`, {
    method: 'DELETE',
  });
};

export const getSubjects = () => apiRequest<Subject[]>('/subjects');

export const createSubject = (subject: Subject) => {
  return apiPost<Subject, Subject>('/subjects', subject);
};

export const getBackup = () => apiRequest<Record<string, unknown>>('/backup');

export const restoreBackup = (snapshot: Record<string, unknown>) => {
  return apiPost<{ message: string; restored: Record<string, number> }, Record<string, unknown>>('/restore', snapshot);
};
