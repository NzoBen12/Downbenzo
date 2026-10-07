export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** Contrato desacoplado: la implementación interna guarda en BD; correo/push se conectan aquí. */
export interface NotificationService {
  notify(payload: NotificationPayload): Promise<void>;
}
export const NOTIFICATION_SERVICE = Symbol('NOTIFICATION_SERVICE');
