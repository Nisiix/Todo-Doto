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
  /** Account di dominio (Active Directory / Entra ID): SID e dominio, per riconoscere la stessa persona su più PC. */
  sid: z.string().default(''),
  domain: z.string().default(''),
  /** Email per i messaggi del workspace (menzioni, assegnazioni, riepilogo), facoltativa. */
  email: z.string().default(''),
  /** Per cosa ricevere un'email: menzioni, task assegnati, riepilogo del mattino. */
  mailOn: z.array(z.enum(['mention', 'assigned', 'digest'])).default([]),
  /** Ore disponibili a settimana per i task (0 = non indicate: il carico si conta in task) (0.6.0). */
  weeklyHours: z.number().default(0),
  /** Assenze (ferie, trasferte): giorni inclusi, YYYY-MM-DD (0.6.0). */
  absences: z.array(z.object({ id: z.string(), from: z.string(), to: z.string(), note: z.string().default('') })).default([]),
})
export type User = z.infer<typeof UserSchema>
export type Absence = User['absences'][number]
export type MailTopic = User['mailOn'][number]

export const UsersFileSchema = z.object({ users: z.array(UserSchema).default([]) })
export type UsersFile = z.infer<typeof UsersFileSchema>

/**
 * Cifratura dei dati sul disco (workspace di rete, vedi services/vault.ts): la
 * chiave dati avvolta con la password. `enabled` falso: i file si scrivono in
 * chiaro, la chiave resta per leggere le copie di sicurezza cifrate.
 */
export const EncryptionInfoSchema = z.object({
  v: z.literal(1).default(1),
  enabled: z.boolean().default(true),
  salt: z.string(),
  iterations: z.number(),
  wrapped: z.string(),
})
export type EncryptionInfo = z.infer<typeof EncryptionInfoSchema>

export const MailSettingsSchema = z.object({
  /** off = solo «Invia per email» (mailto); outlook = Outlook del PC di chi invia; smtp = server aziendale. */
  method: z.enum(['off', 'outlook', 'smtp']).default('off'),
  smtp: z
    .object({
      host: z.string().default(''),
      port: z.number().default(587),
      security: z.enum(['starttls', 'tls', 'none']).default('starttls'),
      from: z.string().default(''),
      user: z.string().default(''),
      /** Password cifrata con una chiave ricavata dalla password del workspace (vedi services/mail.ts). */
      secret: z.string().default(''),
    })
    .default({ host: '', port: 587, security: 'starttls', from: '', user: '', secret: '' }),
  /** Riepilogo del mattino: ora (0-23) dopo la quale il primo PC di un amministratore lo invia. */
  digest: z.object({ enabled: z.boolean().default(false), hour: z.number().min(0).max(23).default(8) }).default({ enabled: false, hour: 8 }),
})
export type MailSettings = z.infer<typeof MailSettingsSchema>
export const MAIL_DEFAULTS: MailSettings = {
  method: 'off',
  smtp: { host: '', port: 587, security: 'starttls', from: '', user: '', secret: '' },
  digest: { enabled: false, hour: 8 },
}

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
  /** Cartella in cui si trovano (o verranno creati) i progetti; i dati del workspace stanno altrove. */
  projectsPath: z.string().default(''),
  /**
   * Copie di sicurezza automatiche dei dati (non dei file dei progetti): una al
   * giorno, fatta dal primo PC che apre il workspace. `dir` vuota = cartella
   * `backups` dentro la cartella Dati.
   */
  backup: z.object({ enabled: z.boolean().default(true), dir: z.string().default('') }).default({ enabled: true, dir: '' }),
  encryption: EncryptionInfoSchema.nullable().default(null),
  /**
   * Accesso con l'account di dominio: gli utenti si riconoscono dal SID
   * dell'account Windows (stessa persona su più PC = un utente) e, se indicati,
   * i ruoli si ricavano dai gruppi di Active Directory.
   */
  domainLogin: z
    .object({ enabled: z.boolean().default(false), adminGroups: z.array(z.string()).default([]), cleanerGroups: z.array(z.string()).default([]) })
    .default({ enabled: false, adminGroups: [], cleanerGroups: [] }),
  /** Email del workspace (Outlook del PC o server SMTP aziendale) e riepilogo del mattino. */
  mail: MailSettingsSchema.default(MAIL_DEFAULTS),
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
  /**
   * Decisione presa (registro delle decisioni): la risposta scelta e, se
   * indicata, la motivazione. Assente nei file delle versioni precedenti.
   */
  decision: z
    .object({ answerId: z.string(), rationale: z.string().default(''), at: iso, by: z.string() })
    .nullable()
    .default(null),
})
export type Question = z.infer<typeof QuestionSchema>
export type Decision = NonNullable<Question['decision']>

export const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().default(''),
  priority: z.enum(PRIORITIES).default('media'),
  status: z.enum(STATUSES).default('da_valutare'),
  /** Scadenza (YYYY-MM-DD): si indica solo per i task con stato Confermato (vedi applyStatusRules). */
  dueDate: z.string().nullable().default(null),
  /** Quando il task è diventato Confermato: inizio della sua barra nel Gantt. */
  confirmedAt: iso.nullable().default(null),
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
  /** Numero progressivo nel progetto: il codice del task è TODO-<seq> (0 = da assegnare, vedi normalizeSeq). */
  seq: z.number().default(0),
  /** Dipendenze: id dei task dello stesso progetto che vanno finiti prima di questo (0.6.0). */
  blockedBy: z.array(z.string()).default([]),
  /** Tappa del progetto (versione, rilascio) a cui appartiene il task (0.6.0). */
  milestoneId: z.string().nullable().default(null),
  /** Stima facoltativa in ore, per il carico per settimana (0.6.0). */
  estimateHours: z.number().nullable().default(null),
  /** Lista di controllo del task: voci da spuntare (0.6.0). */
  checklist: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean().default(false) })).default([]),
  /** Completato in automatico da un commit git ("chiude TODO-12"). */
  closedByCommit: z
    .object({ hash: z.string(), author: z.string().default(''), date: z.string().default(''), subject: z.string().default('') })
    .nullable()
    .default(null),
})
export type Item = z.infer<typeof ItemSchema>

/** Tappa del progetto: una versione o un rilascio, con data obiettivo (0.6.0). */
export const MilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  dueDate: z.string().nullable().default(null), // YYYY-MM-DD
  notes: z.string().default(''),
  /** Raggiunta (chiusa): i task restano legati, la tappa esce dall'elenco delle aperte. */
  closedAt: iso.nullable().default(null),
  createdAt: iso.default(''),
})
export type Milestone = z.infer<typeof MilestoneSchema>

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
  /**
   * Visibilità: pubblica (tutti i membri del workspace) o limitata (solo gli
   * utenti in `members`, oltre agli amministratori). Assente nei file delle
   * versioni precedenti: vedi projectVisibility().
   */
  visibility: z.enum(['public', 'restricted']).optional(),
  version: z.number().default(0),
  createdAt: iso,
  createdBy: z.string(),
  updatedAt: iso,
  updatedBy: z.string(),
  trashedAt: iso.nullable().default(null), // progetto nel cestino del workspace
  items: z.array(ItemSchema).default([]),
  attachmentFolders: z.array(AttachmentFolderSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  /** Tappe (versioni, rilasci) a cui si legano i task (0.6.0). */
  milestones: z.array(MilestoneSchema).default([]),
  stack: StackSchema.default(EMPTY_STACK),
  aiTools: z.array(AiToolSchema).default([]),
  /** Prossimo numero di task (i numeri non si riusano, nemmeno dopo un'eliminazione). */
  nextSeq: z.number().default(0),
  /**
   * Chiusura dei task dai commit git della cartella del progetto. `handled`:
   * commit già usati (ognuno vale una volta sola); `baselineDone`: alla prima
   * lettura i commit esistenti si segnano come visti senza chiudere nulla.
   */
  git: z
    .object({ autoClose: z.boolean().default(true), handled: z.array(z.string()).default([]), baselineDone: z.boolean().default(false) })
    .default({ autoClose: true, handled: [], baselineDone: false }),
  /** Repository GitHub collegato: lo Stack si sincronizza dai suoi file. */
  github: z.object({ owner: z.string(), repo: z.string(), syncedAt: iso.default('') }).nullable().default(null),
  /**
   * Canale Microsoft Teams del progetto: indirizzo di un Workflow («Pubblica in
   * un canale quando si riceve una richiesta webhook») e quali eventi inviare.
   */
  teams: z
    .object({ url: z.string(), events: z.array(z.enum(['item_created', 'item_completed', 'assigned', 'question', 'mention'])).default(['item_completed', 'assigned', 'question', 'mention']) })
    .nullable()
    .default(null),
})
export type Project = z.infer<typeof ProjectSchema>
export type Visibility = 'public' | 'restricted'

/** Visibilità del progetto; per i file delle versioni precedenti la si ricava dagli utenti scelti. */
export const projectVisibility = (p: Pick<Project, 'visibility' | 'members'>): Visibility =>
  p.visibility ?? (p.members.length ? 'restricted' : 'public')

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
  'setup_incomplete',
  'unblocked',
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
  /** Chi ha fatto l'azione; vuoto per le notifiche dell'app (es. configurazione del PC). */
  byId: string
  text: string
  read: boolean
  /**
   * Chiave di deduplica: la stessa notizia non viene creata due volte, nemmeno
   * dopo che la notifica è stata letta o eliminata.
   */
  key?: string
}

// ---------------------------------------------------------------------------
// Configurazione dei PC: esito delle verifiche dei prerequisiti, per utente
// (readiness/<idUtente>.json nella cartella Dati: ognuno scrive solo il suo)
// ---------------------------------------------------------------------------

export const ReadinessMissingSchema = z.object({
  name: z.string(),
  /** missing = non installato; outdated = versione più vecchia di quella richiesta. */
  status: z.enum(['missing', 'outdated']),
  found: z.string().default(''),
  required: z.string().default(''),
})
export type ReadinessMissing = z.infer<typeof ReadinessMissingSchema>

export const ReadinessEntrySchema = z.object({
  checkedAt: iso,
  /** Impronta dei prerequisiti verificati: se lo stack cambia, l'esito va rifatto. */
  hash: z.string(),
  missing: z.array(ReadinessMissingSchema).default([]),
  ok: z.number().default(0),
  /** Prerequisiti di cui non si è potuto stabilire nulla (verifica manuale, comando da confermare…). */
  uncertain: z.number().default(0),
})
export type ReadinessEntry = z.infer<typeof ReadinessEntrySchema>

export const ReadinessFileSchema = z.object({
  userId: z.string(),
  host: z.string().default(''),
  os: z.string().default(''),
  updatedAt: iso,
  projects: z.record(z.string(), ReadinessEntrySchema).default({}),
})
export type ReadinessFile = z.infer<typeof ReadinessFileSchema>

// ---------------------------------------------------------------------------
// Chi lavora a cosa (workspace di rete): un file per utente, presence/<idUtente>.json
// ---------------------------------------------------------------------------

export const PresenceFileSchema = z.object({
  userId: z.string(),
  /** Task su cui l'utente ha detto «Ci sto lavorando»; null = nessuno. */
  projectId: z.string().nullable().default(null),
  itemId: z.string().nullable().default(null),
  /** Da quando ci lavora. */
  since: iso.nullable().default(null),
  /** Ultimo rinnovo: oltre PRESENCE_STALE_MS l'indicazione non vale più (app chiusa male, PC spento). */
  beat: iso,
})
export type PresenceFile = z.infer<typeof PresenceFileSchema>

// ---------------------------------------------------------------------------
// Salute dei progetti: istantanea settimanale (health/<lunedì>.json), una per
// settimana, scritta dal primo PC che apre il workspace in quella settimana
// ---------------------------------------------------------------------------

export const HEALTH_LEVELS = ['green', 'yellow', 'red'] as const
export type HealthLevel = (typeof HEALTH_LEVELS)[number]
export const HealthWeekSchema = z.object({
  week: z.string(),
  at: iso,
  projects: z.record(z.string(), z.enum(HEALTH_LEVELS)).default({}),
})
export type HealthWeek = z.infer<typeof HealthWeekSchema>

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
  /**
   * Client OAuth di Google (tipo «App desktop») impostato da un amministratore
   * per tutto il workspace: gli altri collegano solo il proprio account. Per le
   * app desktop Google non considera il segreto confidenziale.
   */
  oauthClientId: z.string().default(''),
  oauthClientSecret: z.string().default(''),
})
export type DriveFile = z.infer<typeof DriveFileSchema>

// ---------------------------------------------------------------------------
// Configurazione locale (per macchina)
// ---------------------------------------------------------------------------

export const RecentWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(), // cartella Dati Todo Doto (si apre da qui)
  projectsPath: z.string().default(''), // cartella dei progetti (quella mostrata all'utente)
  mode: z.enum(['local', 'network']),
  lastOpened: iso,
})
export type RecentWorkspace = z.infer<typeof RecentWorkspaceSchema>

/**
 * IA locale (per PC): motore installato su questo computer (Ollama o un server
 * compatibile OpenAI come LM Studio / Foundry Local), raggiunto solo su
 * 127.0.0.1. Spenta finché l'utente non la attiva (o finché non la si trova
 * già installata con il modello consigliato, es. dall'installer).
 */
export const AI_PROVIDERS = ['ollama', 'openai'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export const AiConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(AI_PROVIDERS).default('ollama'),
  /** Indirizzo del motore; vuoto = quello predefinito del motore scelto. */
  baseUrl: z.string().default(''),
  model: z.string().default('qwen3:4b'),
  /** Modello per gli embedding (duplicati, ricerca per significato). */
  embedModel: z.string().default('nomic-embed-text'),
  /** Banner "Attiva l'IA locale" chiuso su questo PC: non ricompare più. */
  bannerDismissed: z.boolean().default(false),
  /** Ricerca automatica di un motore già installato fatta (una volta sola). */
  autoDetectDone: z.boolean().default(false),
})
export type AiConfig = z.infer<typeof AiConfigSchema>
export const DEFAULT_AI_CONFIG: AiConfig = AiConfigSchema.parse({})

export const LocalConfigSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  recent: z.array(RecentWorkspaceSchema).default([]),
  reopenLast: z.boolean().default(true),
  /** Copia dei workspace di rete su questo PC, per lavorare quando la cartella condivisa non si raggiunge. */
  offlineCopy: z.boolean().default(true),
  /** VPN di Windows da usare per ogni workspace (id → nome) e se collegarla da sola quando la cartella non risponde. */
  vpn: z.record(z.string(), z.object({ name: z.string(), auto: z.boolean().default(true) })).default({}),
  // workspaceId -> id dei progetti preferiti (scelta personale, per macchina)
  favorites: z.record(z.string(), z.array(z.string())).default({}),
  // tipi di notifica disattivati (tutti attivi se assenti)
  mutedNotifications: z.array(z.enum(NOTIFICATION_TYPES)).default([]),
  ai: AiConfigSchema.default(DEFAULT_AI_CONFIG),
  /**
   * Vista «Oggi»: task rinviati (scelta personale, per macchina, non cambia la
   * scadenza condivisa). workspaceId → id del task → giorno in cui ricompare (YYYY-MM-DD).
   */
  snoozed: z.record(z.string(), z.record(z.string(), z.string())).default({}),
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
  /** Tappa del progetto ('-' = senza tappa). */
  milestoneId?: string | null
}
export const EMPTY_FILTER: ItemFilter = { from: null, to: null, statuses: [], priorities: [], assigneeId: null, createdBy: null, labelId: null, milestoneId: null }
export type LocalConfig = z.infer<typeof LocalConfigSchema>

export const CredentialsFileSchema = z.object({
  // workspaceId -> password cifrata (AES-GCM, base64 "iv.cipher")
  entries: z.record(z.string(), z.string()).default({}),
})
export type CredentialsFile = z.infer<typeof CredentialsFileSchema>

export interface Identity {
  username: string
  hostname: string
  /** Account di dominio (solo PC in dominio o Entra ID; vuoti altrimenti). */
  domain?: string
  sid?: string
  groups?: string[]
}

export type ChangeEvent =
  | { kind: 'project'; id: string; by: string | null }
  | { kind: 'tree' }
  | { kind: 'users' }
  | { kind: 'workspace' }
  | { kind: 'project-removed'; id: string }
