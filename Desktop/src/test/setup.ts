import 'dayjs/locale/it'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { __resetMemoryFs } from '@/services/fs'

dayjs.locale('it')
dayjs.extend(relativeTime)

beforeEach(() => {
  setActivePinia(createPinia())
  __resetMemoryFs()
  localStorage.clear()
})
