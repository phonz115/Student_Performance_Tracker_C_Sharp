import type { AppUser, LoginPayload, MessageResponse, PasswordResetPayload } from '../types';
import { apiPost, apiRequest } from './apiClient';

type LogoutResponse = {
  ok: boolean;
};

export const getSession = () => apiRequest<AppUser>('/session');

export const loginUser = (loginData: LoginPayload) => {
  return apiPost<AppUser, LoginPayload>('/login', loginData);
};

export const requestPasswordReset = (resetData: PasswordResetPayload) => {
  return apiPost<MessageResponse, PasswordResetPayload>('/password-reset/request', resetData);
};

export const logoutUser = () => {
  return apiPost<LogoutResponse, Record<string, never>>('/logout', {});
};
