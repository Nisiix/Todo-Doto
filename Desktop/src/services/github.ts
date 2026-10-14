/**
 * Client minimo per l'API REST di GitHub, con un token personale in sola
 * lettura (Metadata + Contents). Serve a elencare i repository dell'utente e a
 * leggere i file della radice di un repository per ricavarne lo Stack.
 * Nessuna scrittura su GitHub.
 */
import type { FetchFn } from './drive'
import type { ProjectSource } from './projectScan'
import { defineMessages } from '@/i18n'

const API = 'https://api.github.com'

export interface GitHubRepo {
  owner: string
  name: string
  fullName: string
  description: string
  htmlUrl: string
  defaultBranch: string
  private: boolean
  archived: boolean
  fork: boolean
  language: string
  pushedAt: string
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message)
  }
}

const M = defineMessages({
  it: {
    unauthorized: 'Il token GitHub non è valido o è scaduto: collegati di nuovo con un token nuovo.',
    forbidden: 'GitHub ha rifiutato la richiesta (permessi del token o limite di richieste raggiunto): riprova più tardi.',
    notFound: 'Repository non trovato su GitHub, o il token non vi ha accesso.',
    http: (status: number) => `GitHub ha risposto ${status}.`,
  },
  en: {
    unauthorized: 'The GitHub token is not valid or has expired: connect again with a new token.',
    forbidden: 'GitHub refused the request (token permissions or rate limit reached): try again later.',
    notFound: 'Repository not found on GitHub, or the token has no access to it.',
    http: (status: number) => `GitHub responded ${status}.`,
  },
})

/** owner/repo da un URL di repository GitHub (https, ssh o "owner/repo"). */
export function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(url.trim())
  return m ? { owner: m[1]!, repo: m[2]! } : null
}

export class GitHubClient {
  constructor(
    private readonly fetchFn: FetchFn,
    private readonly token: string,
  ) {}

  private async request(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
    const res = await this.fetchFn(`${API}${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Project-Goal-Manager',
      },
    })
    if (res.ok) return res
    if (res.status === 401) throw new GitHubError(M.unauthorized, 401)
    if (res.status === 403 || res.status === 429) throw new GitHubError(M.forbidden, res.status)
    if (res.status === 404) throw new GitHubError(M.notFound, 404)
    throw new GitHubError(M.http(res.status), res.status)
  }

  private async json<T>(path: string): Promise<T> {
    return (await (await this.request(path)).json()) as T
  }

  /** L'account del token. */
  async user(): Promise<{ login: string; name: string }> {
    const u = await this.json<{ login: string; name: string | null }>('/user')
    return { login: u.login, name: u.name ?? u.login }
  }

  /** Repository accessibili (propri, da collaboratore, delle organizzazioni), i più recenti prima. */
  async repos(maxPages = 5): Promise<GitHubRepo[]> {
    type Raw = {
      name: string
      full_name: string
      owner: { login: string }
      description: string | null
      html_url: string
      default_branch: string
      private: boolean
      archived: boolean
      fork: boolean
      language: string | null
      pushed_at: string | null
    }
    const out: GitHubRepo[] = []
    for (let page = 1; page <= maxPages; page++) {
      const list = await this.json<Raw[]>(`/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`)
      for (const r of list)
        out.push({
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
          description: r.description ?? '',
          htmlUrl: r.html_url,
          defaultBranch: r.default_branch,
          private: r.private,
          archived: r.archived,
          fork: r.fork,
          language: r.language ?? '',
          pushedAt: r.pushed_at ?? '',
        })
      if (list.length < 100) break
    }
    return out
  }

  async repo(owner: string, repo: string): Promise<GitHubRepo> {
    const r = await this.json<{ name: string; full_name: string; owner: { login: string }; description: string | null; html_url: string; default_branch: string; private: boolean; archived: boolean; fork: boolean; language: string | null; pushed_at: string | null }>(
      `/repos/${owner}/${repo}`,
    )
    return {
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      description: r.description ?? '',
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch,
      private: r.private,
      archived: r.archived,
      fork: r.fork,
      language: r.language ?? '',
      pushedAt: r.pushed_at ?? '',
    }
  }

  /** Linguaggi del repository, dal più usato. */
  async languages(owner: string, repo: string): Promise<string[]> {
    const l = await this.json<Record<string, number>>(`/repos/${owner}/${repo}/languages`)
    return Object.entries(l)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }

  /** File e cartelle della radice del repository, o di una sua sottocartella. */
  async rootEntries(owner: string, repo: string, sub = ''): Promise<{ name: string; isDir: boolean }[]> {
    const path = sub ? sub.split('/').map(encodeURIComponent).join('/') : ''
    const list = await this.json<{ name: string; type: string }[]>(`/repos/${owner}/${repo}/contents/${path}`)
    return list.map((e) => ({ name: e.name, isDir: e.type === 'dir' }))
  }

  /** Contenuto di un file (null se non esiste). */
  async fileText(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const res = await this.request(`/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, 'application/vnd.github.raw')
      return await res.text()
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null
      throw e
    }
  }

  /** Il repository come sorgente da cui ricavare lo Stack. */
  source(owner: string, repo: string): ProjectSource {
    return {
      list: (sub) => this.rootEntries(owner, repo, sub).catch(() => []),
      read: (name) => this.fileText(owner, repo, name).catch(() => null),
    }
  }
}
