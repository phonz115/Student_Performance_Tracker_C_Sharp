import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type NotificationVariant = 'success' | 'error' | 'info';

type NotificationInput = {
  message: string;
  title?: string;
  variant?: NotificationVariant;
  duration?: number;
};

type NotificationItem = NotificationInput & {
  id: number;
  variant: NotificationVariant;
};

type NotificationContextValue = {
  notify: (notification: NotificationInput) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismiss: (id: number) => void;
};

const DEFAULT_DURATION = {
  success: 4200,
  info: 4800,
  error: 6200,
} as const;

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const ToastViewport = ({
  notifications,
  onDismiss,
}: {
  notifications: NotificationItem[];
  onDismiss: (id: number) => void;
}) => {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`toast-notification toast-${notification.variant}`}
          role={notification.variant === 'error' ? 'alert' : 'status'}
        >
          <div className="toast-notification-body">
            <strong>{notification.title || (notification.variant === 'success' ? 'Success!' : notification.variant === 'error' ? 'Error' : 'Notice')}</strong>
            <p>{notification.message}</p>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(notification.id)}
            aria-label="Dismiss notification"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotifications((currentNotifications) => currentNotifications.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback((notification: NotificationInput) => {
    const message = notification.message.trim();

    if (!message) {
      return;
    }

    const variant = notification.variant || 'info';
    const id = Date.now() + Math.floor(Math.random() * 1000);

    setNotifications([{
      id,
      message,
      title: notification.title,
      variant,
      duration: notification.duration ?? DEFAULT_DURATION[variant],
    }]);
  }, []);

  useEffect(() => {
    if (notifications.length === 0) {
      return undefined;
    }

    const timers = notifications.map((notification) => window.setTimeout(() => {
      dismiss(notification.id);
    }, notification.duration ?? DEFAULT_DURATION[notification.variant]));

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismiss, notifications]);

  const contextValue = useMemo<NotificationContextValue>(() => ({
    notify,
    success: (message, title) => notify({ message, title, variant: 'success' }),
    error: (message, title) => notify({ message, title, variant: 'error' }),
    info: (message, title) => notify({ message, title, variant: 'info' }),
    dismiss,
  }), [dismiss, notify]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      {isMounted ? createPortal(
        <ToastViewport notifications={notifications} onDismiss={dismiss} />,
        document.body,
      ) : null}
    </NotificationContext.Provider>
  );
};

export { NotificationContext };
