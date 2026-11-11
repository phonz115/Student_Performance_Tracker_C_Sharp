import type { AppUser } from '../types';
import { apiRequest } from './apiClient';

export const getUsers = () => apiRequest<AppUser[]>('/users');
