import { customAlphabet } from 'nanoid'

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)

export type IdPrefix = 'ws' | 'usr' | 'fld' | 'cat' | 'prj' | 'itm' | 'cmt' | 'qst' | 'ans' | 'afd' | 'att' | 'lbl' | 'aud'

export const newId = (prefix: IdPrefix) => `${prefix}_${nano()}`
export const nowIso = () => new Date().toISOString()
