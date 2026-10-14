import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enumerazioni
// ---------------------------------------------------------------------------

export const PRIORITIES = ['bassa', 'media', 'alta', 'immediata'] as const
export type Priority = (typeof PRIORITIES)[number]
export const PRIORITY_LABEL: Record<Priority, string> = {
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
  immediata: 'Immediata',
}
export const PRIORITY_RANK: Record<Priority, number> = { immediata: 0, alta: 1, media: 2, bassa: 3 }

export const STATUSES = ['da_valutare', 'da_definire', 'confermato'] as const
export type Status = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<Status, string> = {
  da_valutare: 'Da valutare',
  da_definire: 'Da definire',
  confermato: 'Confermato',
}

export const BUCKETS = ['todo', 'done', 'trash'] as const
export type Bucket = (typeof BUCKETS)[number]
export const BUCKET_LABEL: Record<Bucket, string> = {
  todo: 'Da fare',
  done: 'Completati',
  trash: 'Cestino',
}

export const ROLES = ['admin', 'cleaner', 'member'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABEL: Record<Role, string> = { admin: 'Amministratore', cleaner: 'Cleaner', member: 'Membro' }
export type WorkspaceMode = 'local' | 'network'

// ---------------------------------------------------------------------------
// Schemi zod (validano i file JSON letti da disco)
// ---------------------------------------------------------------------------

const iso = z.string()

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  hostname: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  createdAt: iso,
})
export type User = z.infer<typeof UserSchema>

export const UsersFileSchema = z.object({ users: z.array(UserSchema).default([]) })
export type UsersFile = z.infer<typeof UsersFileSchema>

export const WorkspaceMetaSchema = z.object({
  schema: z.number().default(1),
  id: z.string(),
  name: z.string(),
  mode: z.enum(['local', 'network']),
  createdBy: z.string(),
  createdAt: iso,
  auth: z
    .object({ salt: z.string(), hash: z.string(), iterations: z.number() })
    .nullable()
    .default(null),
})
export type WorkspaceMeta = z.infer<typeof WorkspaceMetaSchema>

export const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable().default(null),
  order: z.number().default(0),
})
export type Folder = z.infer<typeof FolderSchema>

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().default('#4FB3E8'),
})
export type Category = z.infer<typeof CategorySchema>

/** Etichetta/badge applicabile a un elemento; definita a livello di workspace. */
export const LabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().default('#9B7BD6'),
})
export type Label = z.infer<typeof LabelSchema>

export const TreeFileSchema = z.object({
  folders: z.array(FolderSchema).default([]),
  categories: z.array(CategorySchema).default([]),
  labels: z.array(LabelSchema).default([]),
})
export type TreeFile = z.infer<typeof TreeFileSchema>

export const CommentSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  text: z.string(),
  mentions: z.array(z.string()).default([]),
  createdAt: iso,
})
export type Comment = z.infer<typeof CommentSchema>

export const AnswerSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  text: z.string(),
  mentions: z.array(z.string()).default([]),
  createdAt: iso,
})
export type Answer = z.infer<typeof AnswerSchema>

export const QuestionSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  text: z.string(),
  mentions: z.array(z.string()).default([]),
  createdAt: iso,
  resolved: z.boolean().default(false),
  resolvedAt: iso.nullable().default(null),
  answers: z.array(AnswerSchema).default([]),
})
export type Question = z.infer<typeof QuestionSchema>

export const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().default(''),
  priority: z.enum(PRIORITIES).default('media'),
  status: z.enum(STATUSES).default('da_valutare'),
  dueDate: z.string().nullable().default(null), // YYYY-MM-DD
  labelId: z.string().nullable().default(null),
  bucket: z.enum(BUCKETS).default('todo'),
  createdAt: iso,
  createdBy: z.string(),
  updatedAt: iso.optional(),
  completedAt: iso.nullable().default(null),
  trashedAt: iso.nullable().default(null),
  comments: z.array(CommentSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
})
export type Item = z.infer<typeof ItemSchema>

export const AttachmentFolderSchema = z.object({ id: z.string(), name: z.string() })
export type AttachmentFolder = z.infer<typeof AttachmentFolderSchema>

export const AttachmentSchema = z.object({
  id: z.string(),
  kind: z.enum(['file', 'link', 'drive']), // drive: target = id del file su Google Drive
  name: z.string(),
  target: z.string(),
  folderId: z.string().nullable().default(null),
  addedBy: z.string(),
  addedAt: iso,
})
export type Attachment = z.infer<typeof AttachmentSchema>

export const ProjectSchema = z.object({
  schema: z.number().default(1),
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  folderId: z.string().nullable().default(null),
  categoryId: z.string().nullable().default(null),
  members: z.array(z.string()).default([]),
  version: z.number().default(0),
  createdAt: iso,
  createdBy: z.string(),
  updatedAt: iso,
  updatedBy: z.string(),
  trashedAt: iso.nullable().default(null), // progetto nel cestino del workspace
  items: z.array(ItemSchema).default([]),
  attachmentFolders: z.array(AttachmentFolderSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
})
export type Project = z.infer<typeof ProjectSchema>

// ---------------------------------------------------------------------------
// Cronologia delle operazioni sugli elementi (per gli admin)
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'item_created',
  'item_completed',
  'item_reopened',
  'item_trashed',
  'item_restored',
  'item_deleted',
  'trash_emptied',
  'project_created',
  'project_trashed',
  'project_restored',
  'project_deleted',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
export const AUDIT_LABEL: Record<AuditAction, string> = {
  item_created: 'Elemento creato',
  item_completed: 'Completato',
  item_reopened: 'Riaperto',
  item_trashed: 'Spostato nel cestino',
  item_restored: 'Ripristinato dal cestino',
  item_deleted: 'Eliminato definitivamente',
  trash_emptied: 'Cestino svuotato',
  project_created: 'Progetto creato',
  project_trashed: 'Progetto nel cestino',
  project_restored: 'Progetto ripristinato',
  project_deleted: 'Progetto eliminato definitivamente',
}

export const AuditEntrySchema = z.object({
  id: z.string(),
  at: iso,
  userId: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  projectId: z.string(),
  projectName: z.string(),
  itemId: z.string().nullable().default(null),
  itemTitle: z.string().nullable().default(null),
  count: z.number().nullable().default(null), // per "cestino svuotato"
})
export type AuditEntry = z.infer<typeof AuditEntrySchema>

export const AuditFileSchema = z.object({ entries: z.array(AuditEntrySchema).default([]) })
export type AuditFile = z.infer<typeof AuditFileSchema>

// ---------------------------------------------------------------------------
// Notifiche interne (per macchina): tipi e preferenze
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'item_created',
  'item_status',
  'item_completed',
  'item_trashed',
  'item_notes',
  'question',
  'answer',
  'comment',
  'mention',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  item_created: 'Nuovo elemento',
  item_status: 'Cambio di stato (da valutare, da definire, confermato)',
  item_completed: 'Elemento completato o riaperto',
  item_trashed: 'Elemento spostato nel cestino o ripristinato',
  item_notes: 'Descrizione modificata',
  question: 'Nuova domanda',
  answer: 'Nuova risposta',
  comment: 'Nuovo commento',
  mention: 'Qualcuno mi tagga con @',
}

export interface Notification {
  id: string
  at: string
  type: NotificationType
  projectId: string
  projectName: string
  itemId: string | null
  itemTitle: string
  byId: string
  text: string
  read: boolean
}

// ---------------------------------------------------------------------------
// Google Drive: struttura replicata della cartella scelta (solo metadati)
// ---------------------------------------------------------------------------

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

export const DriveNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  parentId: z.string().nullable().default(null), // null = radice sincronizzata
  modifiedTime: z.string().default(''),
  size: z.number().nullable().default(null),
  webViewLink: z.string().nullable().default(null),
})
export type DriveNode = z.infer<typeof DriveNodeSchema>

export const DriveFileSchema = z.object({
  schema: z.number().default(1),
  rootFolderId: z.string().nullable().default(null),
  rootName: z.string().default(''),
  syncedAt: iso.nullable().default(null),
  syncedBy: z.string().nullable().default(null),
  nodes: z.array(DriveNodeSchema).default([]),
})
export type DriveFile = z.infer<typeof DriveFileSchema>

// ---------------------------------------------------------------------------
// Configurazione locale (per macchina)
// ---------------------------------------------------------------------------

export const RecentWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  mode: z.enum(['local', 'network']),
  lastOpened: iso,
})
export type RecentWorkspace = z.infer<typeof RecentWorkspaceSchema>

export const LocalConfigSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  recent: z.array(RecentWorkspaceSchema).default([]),
  reopenLast: z.boolean().default(true),
  // workspaceId -> id dei progetti preferiti (scelta personale, per macchina)
  favorites: z.record(z.string(), z.array(z.string())).default({}),
  // tipi di notifica disattivati (tutti attivi se assenti)
  mutedNotifications: z.array(z.enum(NOTIFICATION_TYPES)).default([]),
})

/** Filtro della lista elementi di un progetto. */
export interface ItemFilter {
  from: string | null // YYYY-MM-DD, su dueDate
  to: string | null
  statuses: Status[]
  priorities: Priority[]
  userId: string | null // createdBy
  labelId: string | null
}
export const EMPTY_FILTER: ItemFilter = { from: null, to: null, statuses: [], priorities: [], userId: null, labelId: null }
export type LocalConfig = z.infer<typeof LocalConfigSchema>

export const CredentialsFileSchema = z.object({
  // workspaceId -> password cifrata (AES-GCM, base64 "iv.cipher")
  entries: z.record(z.string(), z.string()).default({}),
})
export type CredentialsFile = z.infer<typeof CredentialsFileSchema>

export interface Identity {
  username: string
  hostname: string
}

export type ChangeEvent =
  | { kind: 'project'; id: string; by: string | null }
  | { kind: 'tree' }
  | { kind: 'users' }
  | { kind: 'workspace' }
  | { kind: 'project-removed'; id: string }
