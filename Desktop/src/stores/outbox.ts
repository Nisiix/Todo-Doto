import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import dayjs from 'dayjs'
import { useWorkspaceStore } from './workspace'
import { diffProjects } from '@/services/changes'
import { buildDigest, digestIsEmpty, digestMail, outgoingEvents, personalMail, teamsCard, type OutgoingEvent, type TeamsEvent } from '@/services/mail'
import { isEmail, isTeamsWebhook, postTeams } from '@/services/office'
import type { Project } from '@/types'

/** Tentativi per un messaggio a Teams prima di lasciar perdere. */
const MAX_TRIES = 3

interface TeamsJob {
  url: string
  card: unknown
  tries: number
}

/**
 * Messaggi in uscita (tutti facoltativi, configurati dagli amministratori):
 *
 * - **Teams**: ciò che fa questo utente in un progetto con un canale collegato
 *   (task creati e completati, assegnazioni, domande, menzioni) diventa una
 *   scheda nel canale. Lo invia solo il PC di chi fa la modifica: niente doppioni.
 * - **Email personali**: a chi viene menzionato o riceve un task, se ha indicato
 *   la sua email e lo ha scelto, e se vede il progetto.
 * - **Riepilogo del mattino**: dopo l'ora scelta, il primo PC di un
 *   amministratore aperto lo manda a chi lo ha chiesto (un segnaposto nella
 *   cartella Dati garantisce un solo invio al giorno).
 */
export const useOutboxStore = defineStore('outbox', () => {
  const queue = ref<TeamsJob[]>([])
  const sending = ref(false)
  /** Ultimi invii (per i test e per capire cosa è uscito): tipo e destinazione, senza contenuti. */
  const log = ref<{ at: string; channel: 'teams' | 'mail'; ok: boolean; what: string }[]>([])
  const note = (channel: 'teams' | 'mail', ok: boolean, what: string) => (log.value = [...log.value.slice(-49), { at: new Date().toISOString(), channel, ok, what }])

  const ws = () => useWorkspaceStore()

  function onLocalChange(before: Project, after: Project) {
    const w = ws()
    const me = w.currentUser?.id
    if (!w.isNetwork || !me) return
    const events = outgoingEvents(after, diffProjects(before, after)).filter((e) => e.by === me)
    if (!events.length) return
    // Teams: canale del progetto
    const t = after.teams
    if (t && isTeamsWebhook(t.url)) {
      for (const e of events) {
        if (!(t.events as string[]).includes(e.kind)) continue
        queue.value = [...queue.value, { url: t.url, card: teamsCard(after, e, w.userName), tries: 0 }]
      }
      void flushTeams()
    }
    // Email a chi è menzionato o riceve il task
    for (const e of events) void mailPeople(after, e)
  }

  async function mailPeople(project: Project, e: OutgoingEvent) {
    if (e.kind !== 'mention' && e.kind !== 'assigned') return
    const w = ws()
    const topic = e.kind === 'mention' ? 'mention' : 'assigned'
    for (const id of e.to) {
      const u = w.usersById[id]
      if (!u || id === e.by || !isEmail(u.email) || !u.mailOn.includes(topic) || !w.canUserSee(u, project)) continue
      const msg = personalMail(project, e, w.userName)
      const ok = await w.sendMail({ to: [u.email], ...msg })
      if (ok !== 'off') note('mail', ok, topic)
    }
  }

  async function flushTeams() {
    if (sending.value) return
    sending.value = true
    try {
      while (queue.value.length) {
        const job = queue.value[0]!
        const ok = await postTeams(job.url, job.card).catch(() => false)
        note('teams', ok, 'card')
        // Non riuscito (senza Internet, servizio occupato): si riprova più avanti, al massimo MAX_TRIES volte
        if (!ok && ++job.tries < MAX_TRIES) break
        queue.value = queue.value.slice(1)
      }
    } finally {
      sending.value = false
    }
  }

  // --- riepilogo del mattino -------------------------------------------------------
  const lastDigestKey = () => `pgm:digestDone:${ws().meta?.id ?? ''}`
  function doneToday(today: string) {
    try {
      return localStorage.getItem(lastDigestKey()) === today
    } catch {
      return false
    }
  }
  function markDone(today: string) {
    try {
      localStorage.setItem(lastDigestKey(), today)
    } catch {
      /* solo comodità */
    }
  }

  /** Invia il riepilogo di oggi se tocca a questo PC. Ritorna quanti messaggi sono partiti. */
  async function maybeSendDigest(now = dayjs()): Promise<number> {
    const w = ws()
    const ms = w.meta?.mail
    if (w.status !== 'open' || !w.isNetwork || !w.isAdmin || !ms?.digest.enabled || ms.method === 'off') return 0
    const today = now.format('YYYY-MM-DD')
    if (now.hour() < ms.digest.hour || doneToday(today)) return 0
    markDone(today)
    if (!(await w.claimDaily(`digest-${today}`))) return 0 // l'ha già mandato un altro PC
    let sent = 0
    for (const u of w.users) {
      if (!isEmail(u.email) || !u.mailOn.includes('digest')) continue
      const visible = Object.values(w.projects).filter((p) => !p.trashedAt && w.canUserSee(u, p))
      const d = buildDigest(u, visible, now)
      if (digestIsEmpty(d)) continue
      const ok = await w.sendMail({ to: [u.email], ...digestMail(u, d, now) })
      note('mail', ok === true, 'digest')
      if (ok === true) sent++
    }
    return sent
  }

  // Controllo ogni minuto mentre un workspace di rete è aperto; al ritorno in rete si svuota la coda di Teams
  let timer: ReturnType<typeof setInterval> | null = null
  watch(
    () => ws().status,
    (st, prev) => {
      if (st === 'open' && !timer) {
        timer = setInterval(() => {
          void maybeSendDigest()
          if (queue.value.length && new Date().getMinutes() % 5 === 0) void flushTeams()
        }, 60_000)
        setTimeout(() => void maybeSendDigest(), 10_000)
      }
      if (st === 'closed' && timer) {
        clearInterval(timer)
        timer = null
        queue.value = []
      }
      if (st === 'open' && prev === 'unreachable') void flushTeams()
    },
    { immediate: true },
  )

  return { queue, log, onLocalChange, flushTeams, maybeSendDigest }
})

export type { TeamsEvent }
