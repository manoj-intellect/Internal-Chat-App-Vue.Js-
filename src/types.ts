export interface ApiEnvelope<T> {
  success: boolean
  data: T
  message?: string
  meta?: Record<string, unknown>
  errors?: Record<string, string[]>
}

export interface NotificationPreferences {
  push_enabled: boolean
  previews: boolean
  private_messages: boolean
  group_messages: boolean
}

export interface CurrentUser {
  id: number
  name: string
  email: string
  status: string
  is_admin: boolean
  email_verified: boolean
  notification_preferences: NotificationPreferences
}

export interface DirectoryUser {
  id: number
  name: string
  email: string
  status: string
}

export type ParticipantRole = 'owner' | 'admin' | 'member'

export interface Member {
  id: number
  name: string
  status: string
  role: ParticipantRole
}

export interface Conversation {
  id: number
  type: 'direct' | 'group'
  name: string
  direct_user: { id: number; name: string; status: string } | null
  my_role: ParticipantRole | null
  member_count: number | null
  members?: Member[]
  unread_count: number
  last_read_message_id: number | null
  last_message: {
    id: number
    type: MessageType
    sender_id: number | null
    sender_name: string | null
    preview: string
    created_at: string
  } | null
  last_message_at: string | null
  created_at: string
}

export type MessageType = 'text' | 'attachment' | 'system'

export interface Attachment {
  id: number
  name: string
  mime_type: string
  size: number
  is_image: boolean
  download_url: string
  preview_url: string | null
}

export interface Message {
  id: number
  conversation_id: number
  type: MessageType
  body: string | null
  sender: { id: number; name: string } | null
  secrets: { id: number }[]
  attachments: Attachment[]
  created_at: string
}

export interface ClientConfig {
  app_name: string
  session_timeout_minutes: number
  messages: { max_length: number }
  secrets: { max_per_message: number; max_length: number }
  attachments: { max_size_mb: number; allowed_types: string[]; max_per_message: number }
  realtime: { enabled: boolean; key: string | null; host: string; port: number; scheme: string; poll_seconds: number }
  push: {
    enabled: boolean
    previews_allowed: boolean
    firebase: {
      apiKey: string
      authDomain: string
      projectId: string
      messagingSenderId: string
      appId: string
      vapidKey: string
    } | null
  }
}

export interface InAppNotification {
  id: string
  data: { type: string; conversation_id?: number; conversation_name?: string; added_by?: string }
  read_at: string | null
  created_at: string
}
