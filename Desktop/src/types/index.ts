import { z } from 'zod'
import { common } from '@/i18n/common'

// ---------------------------------------------------------------------------
// Enumerazioni
// ---------------------------------------------------------------------------

export const PRIORITIES = ['bassa', 'media', 'alta', 'immediata'] as const
export type Priority = (typeof PRIORITIES)[number]
export const PRIORITY_LABEL: Record<Priority, string> = common.priority
export const PRIORITY_RANK: Record<Priority, number> = { immediata: 0, alta: 1, media: 2, bassa: 3 }

export const STATUSES = ['da_valutare', 'da_definire', 'confermato'] as const
export type Status = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<Status, string> = common.status

export const BUCKETS = ['todo', 'done', 'trash'] as const
export type Bucket = (typeof BUCKETS)[number]
export const BUCKET_LABEL: Record<Bucket, string> = common.bucket

export const ROLES = ['admin', 'cleaner', 'member'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABEL: Record<Role, string> = common.role
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

/** Etichetta/badge applicabile a un elemento; definita a livello di workspace. */
export const LabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().default('#9B7BD6'),
})
export type Label = z.infer<typeof LabelSchema>

/**
 * tree.json: cartelle ed etichette del workspace.
 * `categories` è un campo DEPRECATO (sostituito dalle cartelle): i file scritti
 * dalle prime versioni possono ancora contenerlo, viene letto e scartato.
 */
export const TreeFileSchema = z
  .object({
    folders: z.array(FolderSchema).default([]),
    labels: z.array(LabelSchema).default([]),
    categories: z.array(z.unknown()).optional(),
  })
  .transform(({ categories: _legacy, ...tree }) => tree)
export type TreeFile = z.output<typeof TreeFileSchema>

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
  assigneeId: z.string().nullable().default(null), // a chi è assegnato (facoltativo)
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

// ---------------------------------------------------------------------------
// Sezioni del progetto: Stack (tecnologie e configurazione) e Strumenti AI
// ---------------------------------------------------------------------------

export const PLATFORMS = ['web', 'desktop', 'mobile', 'backend', 'altro'] as const
export type Platform = (typeof PLATFORMS)[number]
export const PLATFORM_LABEL: Record<Platform, string> = common.platform

export const PrerequisiteSchema = z.object({
  id: z.string(),
  name: z.string(), // es. Node.js
  version: z.string().default(''), // es. 20+
  url: z.string().default(''), // dove scaricarlo
  check: z.string().default(''), // comando per verificarlo, es. node -v
})
export type Prerequisite = z.infer<typeof PrerequisiteSchema>

export const SETUP_STEP_KINDS = ['command', 'manual', 'link'] as const
export type SetupStepKind = (typeof SETUP_STEP_KINDS)[number]
export const SETUP_STEP_LABEL: Record<SetupStepKind, string> = common.setupStep

export const SetupStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(SETUP_STEP_KINDS).default('command'),
  command: z.string().default(''), // per kind=command (può avere più righe)
  cwd: z.string().default(''), // cartella relativa in cui eseguire
  url: z.string().default(''), // per kind=link
  notes: z.string().default(''),
})
export type SetupStep = z.infer<typeof SetupStepSchema>

export const EnvVarSchema = z.object({ key: z.string(), example: z.string().default(''), notes: z.string().default('') })
export type EnvVar = z.infer<typeof EnvVarSchema>

/**
 * File iniziale da creare nella cartella di un nuovo progetto (es. package.json,
 * .gitignore). Percorso relativo alla cartella; percorso e contenuto possono
 * usare i segnaposto {{name}} (nome del progetto) e {{slug}} (nome per cartelle e URL).
 */
export const TemplateFileSchema = z.object({ id: z.string(), path: z.string(), content: z.string().default('') })
export type TemplateFile = z.infer<typeof TemplateFileSchema>

/** Documento di architettura (.md) importato nello Stack: resta consultabile e finisce nella cartella del progetto. */
export const StackDocSchema = z.object({ fileName: z.string(), content: z.string(), importedAt: iso.default('') })
export type StackDoc = z.infer<typeof StackDocSchema>

export const StackSchema = z.object({
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  languages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  repoUrl: z.string().default(''), // repository remoto (git)
  sourcePath: z.string().default(''), // cartella del progetto sul PC/rete dell'admin
  notes: z.string().default(''),
  prerequisites: z.array(PrerequisiteSchema).default([]),
  steps: z.array(SetupStepSchema).default([]),
  envVars: z.array(EnvVarSchema).default([]),
  files: z.array(TemplateFileSchema).default([]), // file iniziali per creare la cartella del progetto
  doc: StackDocSchema.nullable().default(null), // documento di architettura importato (.md)
})
export type Stack = z.infer<typeof StackSchema>
export const EMPTY_STACK: Stack = { platforms: [], languages: [], frameworks: [], repoUrl: '', sourcePath: '', notes: '', prerequisites: [], steps: [], envVars: [], files: [], doc: null }

export const AI_TOOL_KINDS = ['connector', 'plugin', 'skill'] as const
export type AiToolKind = (typeof AI_TOOL_KINDS)[number]
export const AI_TOOL_LABEL: Record<AiToolKind, string> = common.aiTool

export const AiToolSchema = z.object({
  id: z.string(),
  kind: z.enum(AI_TOOL_KINDS),
  name: z.string(),
  notes: z.string().default(''),
  url: z.string().default(''),
  // per le skill: il contenuto del file allegato (es. SKILL.md) e il suo nome
  fileName: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  addedBy: z.string().default(''),
  addedAt: iso.default(''),
})
export type AiTool = z.infer<typeof AiToolSchema>

export const ProjectSchema = z.object({
  schema: z.number().default(1),
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  folderId: z.string().nullable().default(null),
  /** @deprecated Campo delle prime versioni (categorie): ignorato, resta solo per leggere i file esistenti. */
  categoryId: z.string().nullable().optional(),
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
  stack: StackSchema.default(EMPTY_STACK),
  aiTools: z.array(AiToolSchema).default([]),
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
export const AUDIT_LABEL: Record<AuditAction, string> = common.audit

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
  'assigned',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
export const NOTIFICATION_LABEL: Record<NotificationType, string> = common.notification

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
  assigneeId: string | null // assegnato a
  createdBy: string | null // creato da
  labelId: string | null
}
export const EMPTY_FILTER: ItemFilter = { from: null, to: null, statuses: [], priorities: [], assigneeId: null, createdBy: null, labelId: null }
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
