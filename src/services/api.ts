import { http } from './http'
import type {
  ApiEnvelope,
  Attachment,
  ClientConfig,
  Conversation,
  CurrentUser,
  DirectoryUser,
  InAppNotification,
  Member,
  Message,
  NotificationPreferences,
} from '@/types'

const data = <T>(p: Promise<{ data: ApiEnvelope<T> }>) => p.then((r) => r.data.data)

export const authApi = {
  publicConfig: () => data<{ app_name: string; registration_mode: string }>(http.get('/api/config/public')),
  me: () => data<CurrentUser>(http.get('/api/auth/me', { _skipAuthRedirect: true } as object)),
  login: (email: string, password: string) => data<CurrentUser>(http.post('/api/auth/login', { email, password })),
  register: (payload: { name: string; email: string; password: string; password_confirmation: string }) =>
    http.post<ApiEnvelope<CurrentUser | { requires_approval: true }>>('/api/auth/register', payload).then((r) => r.data),
  logout: (pushToken?: string | null) => http.post('/api/auth/logout', pushToken ? { push_token: pushToken } : {}),
  forgotPassword: (email: string) => http.post<ApiEnvelope<null>>('/api/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload: { token: string; email: string; password: string; password_confirmation: string }) =>
    http.post<ApiEnvelope<null>>('/api/auth/reset-password', payload).then((r) => r.data),
  changePassword: (payload: { current_password: string; password: string; password_confirmation: string }) =>
    http.put('/api/auth/password', payload),
}

export const chatApi = {
  config: () => data<ClientConfig>(http.get('/api/config')),
  users: (search = '') => data<DirectoryUser[]>(http.get('/api/users', { params: { search } })),

  conversations: () => data<Conversation[]>(http.get('/api/conversations')),
  conversation: (id: number) => data<Conversation>(http.get(`/api/conversations/${id}`)),
  startDirect: (userId: number) => data<Conversation>(http.post('/api/conversations', { type: 'direct', user_id: userId })),
  createGroup: (name: string, memberIds: number[]) =>
    data<Conversation>(http.post('/api/conversations', { type: 'group', name, member_ids: memberIds })),
  renameGroup: (id: number, name: string) => data<Conversation>(http.patch(`/api/conversations/${id}`, { name })),

  members: (id: number) => data<Member[]>(http.get(`/api/conversations/${id}/members`)),
  addMembers: (id: number, userIds: number[]) => http.post(`/api/conversations/${id}/members`, { user_ids: userIds }),
  removeMember: (id: number, userId: number) => http.delete(`/api/conversations/${id}/members/${userId}`),
  changeRole: (id: number, userId: number, role: string) => http.patch(`/api/conversations/${id}/members/${userId}`, { role }),
  leave: (id: number) => http.post(`/api/conversations/${id}/leave`),

  messages: (id: number, cursor?: string | null) =>
    http
      .get<ApiEnvelope<Message[]>>(`/api/conversations/${id}/messages`, { params: cursor ? { cursor } : {} })
      .then((r) => ({ items: r.data.data, nextCursor: (r.data.meta?.next_cursor as string | null) ?? null })),
  messagesAfter: (id: number, afterId: number) =>
    data<Message[]>(http.get(`/api/conversations/${id}/messages`, { params: { after_id: afterId } })),
  send: (id: number, body: string, secrets: string[], attachmentIds: number[]) =>
    data<Message>(http.post(`/api/conversations/${id}/messages`, { body, secrets, attachment_ids: attachmentIds })),
  deleteMessage: (messageId: number) => http.delete(`/api/messages/${messageId}`),
  markRead: (id: number, messageId?: number) => http.post(`/api/conversations/${id}/read`, messageId ? { message_id: messageId } : {}),

  /** Secret ids travel in the URL path; the secret VALUE only ever in the response body. */
  revealSecret: (messageId: number, secretId: number) =>
    data<{ id: number; value: string }>(http.post(`/api/messages/${messageId}/secrets/${secretId}/reveal`)),

  upload: (conversationId: number, file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return data<Attachment>(
      http.post(`/api/conversations/${conversationId}/attachments`, form, {
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      }),
    )
  },
  discardUpload: (attachmentId: number) => http.delete(`/api/attachments/${attachmentId}`),

  search: (q: string) =>
    data<{ message: Message; conversation: { id: number; type: string; name: string | null } }[]>(
      http.get('/api/search/messages', { params: { q } }),
    ),

  notifications: () => http.get<ApiEnvelope<InAppNotification[]>>('/api/notifications').then((r) => r.data),
  markNotificationsRead: () => http.post('/api/notifications/read'),
  preferences: () => data<NotificationPreferences>(http.get('/api/me/notification-preferences')),
  updatePreferences: (prefs: Partial<NotificationPreferences>) =>
    data<NotificationPreferences>(http.put('/api/me/notification-preferences', prefs)),

  devices: () =>
    data<{ id: number; platform: string; browser: string | null; device_name: string | null; last_used_at: string | null }[]>(
      http.get('/api/push-tokens'),
    ),
  registerPushToken: (payload: { token: string; previous_token?: string | null; platform: string; browser: string; device_name: string }) =>
    http.post('/api/push-tokens', payload),
  removePushToken: (token: string) => http.delete('/api/push-tokens', { data: { token } }),
  removeDevice: (id: number) => http.delete(`/api/push-tokens/${id}`),
}

export const adminApi = {
  users: (params: { search?: string; status?: string; page?: number }) =>
    http.get<ApiEnvelope<AdminUser[]>>('/api/admin/users', { params }).then((r) => r.data),
  createUser: (payload: { name: string; email: string; password: string; is_admin: boolean }) =>
    data<AdminUser>(http.post('/api/admin/users', payload)),
  updateUser: (id: number, payload: Partial<{ name: string; status: string; is_admin: boolean }>) =>
    data<AdminUser>(http.patch(`/api/admin/users/${id}`, payload)),
  settings: () =>
    data<{
      values: Record<string, unknown>
      definitions: Record<string, { default: unknown; description: string }>
      supported_attachment_types: string[]
      absolute_max_attachment_size_mb: number
    }>(http.get('/api/admin/settings')),
  updateSettings: (values: Record<string, unknown>) => data<{ values: Record<string, unknown> }>(http.put('/api/admin/settings', values)),
  auditLogs: (params: { action?: string; page?: number }) =>
    http.get<ApiEnvelope<AuditEntry[]>>('/api/admin/audit-logs', { params }).then((r) => r.data),
  systemStatus: () => data<Record<string, Record<string, unknown>>>(http.get('/api/admin/system-status')),
}

export interface AdminUser {
  id: number
  name: string
  email: string
  status: 'active' | 'inactive' | 'suspended'
  is_admin: boolean
  email_verified: boolean
  push_devices: number
  last_login_at: string | null
  created_at: string
}

export interface AuditEntry {
  id: number
  action: string
  user: { id: number; name: string; email: string } | null
  subject_type: string | null
  subject_id: number | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
