import { API_BASE_URL } from '../constants/app';

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

const getErrorMessage = (data: unknown) => {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = data.message;

    if (typeof message === 'string') {
      return message;
    }
  }

  return 'Request failed';
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = response.status === 401 && data === null
      ? 'Unauthorized'
      : getErrorMessage(data);
    throw new Error(message);
  }

  return data as T;
};

export const apiPost = <TResponse, TBody extends object>(
  path: string,
  body: TBody,
  options: RequestInit = {},
) => {
  return apiRequest<TResponse>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...options,
  });
};
