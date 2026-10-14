<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Shield } from 'lucide-vue-next'
import BaseDialog from '@/components/ui/BaseDialog.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Project } from '@/types'

const props = defineProps<{ project?: Project | null; defaultFolderId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const ws = useWorkspaceStore()
const router = useRouter()

const name = ref('')
const description = ref('')
const folderId = ref<string | null>(null)
const access = ref<'all' | 'restricted'>('all')
const members = ref<string[]>([])
const error = ref('')

const isEdit = computed(() => !!props.project)
/** Gli admin vedono sempre tutto: nella lista sono mostrati ma non selezionabili. */
const admins = computed(() => ws.users.filter((u) => u.role === 'admin'))
const others = computed(() => ws.users.filter((u) => u.role !== 'admin'))
const selectedCount = computed(() => members.value.filter((id) => others.value.some((u) => u.id === id)).length)

watch(open, (o) => {
  if (!o) return
  const p = props.project
  name.value = p?.name ?? ''
  description.value = p?.description ?? ''
  folderId.value = p?.folderId ?? props.defaultFolderId ?? null
  members.value = p?.members ? [...p.members] : []
  access.value = members.value.length > 0 ? 'restricted' : 'all'
  error.value = ''
})

/** Cartelle in ordine ad albero, con indentazione. */
const folderOptions = computed(() => {
  const out: { id: string; label: string }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const f of ws.foldersByParent[parentId ?? 'root'] ?? []) {
      out.push({ id: f.id, label: `${'  '.repeat(depth)}${depth ? '└ ' : ''}${f.name}` })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

function toggleMember(id: string) {
  members.value = members.value.includes(id) ? members.value.filter((m) => m !== id) : [...members.value, id]
}

async function submit() {
  if (!name.value.trim()) return (error.value = 'Il progetto ha bisogno di un nome.')
  // Con accesso riservato, gli admin sono inclusi comunque: così il file resta
  // coerente anche se più avanti un admin viene retrocesso a membro.
  const restrictedMembers = [...new Set([...members.value.filter((id) => others.value.some((u) => u.id === id)), ...admins.value.map((a) => a.id)])]
  if (access.value === 'restricted' && selectedCount.value === 0 && others.value.length > 0)
    return (error.value = 'Scegli almeno una persona, oppure apri il progetto a tutti.')
  const data = {
    name: name.value,
    description: description.value.trim(),
    folderId: folderId.value,
    categoryId: null,
    members: access.value === 'restricted' && ws.isNetwork ? restrictedMembers : [],
  }
  if (props.project) {
    await ws.updateProject(props.project.id, data)
  } else {
    const p = await ws.createProject(data)
    if (p) router.push({ name: 'project', params: { id: p.id } })
  }
  open.value = false
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="isEdit ? 'Impostazioni progetto' : 'Nuovo progetto'">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="p-name">Nome</label>
        <input id="p-name" v-model="name" class="field" placeholder="Es. Bilancio Europeo Web" data-autofocus />
      </div>
      <div>
        <label class="label" for="p-desc">Descrizione</label>
        <textarea id="p-desc" v-model="description" class="field min-h-16 resize-y" placeholder="Facoltativa" />
      </div>
      <div>
        <label class="label" for="p-folder">Cartella</label>
        <select id="p-folder" v-model="folderId" class="field">
          <option :value="null">Nessuna cartella</option>
          <option v-for="f in folderOptions" :key="f.id" :value="f.id">{{ f.label }}</option>
        </select>
      </div>

      <div v-if="ws.isNetwork && ws.isAdmin">
        <span class="label">Chi può vedere e modificare il progetto</span>
        <SegmentedControl
          v-model="access"
          :options="[
            { value: 'all', label: 'Tutti i membri del workspace' },
            { value: 'restricted', label: 'Solo alcune persone' },
          ]"
        />
        <div v-if="access === 'restricted'" class="mt-2 rounded-md border border-line">
          <ul class="max-h-44 divide-y divide-line overflow-y-auto">
            <li v-for="u in admins" :key="u.id" class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] text-ink-2">
              <input type="checkbox" class="accent-accent" checked disabled />
              <UserAvatar :name="u.displayName" size="xs" />
              <span class="flex-1">{{ u.displayName }}<span v-if="u.id === ws.currentUser?.id"> (tu)</span></span>
              <span class="flex items-center gap-1 text-[11.5px] text-ink-3" title="Gli amministratori vedono sempre tutti i progetti"><Shield :size="11" /> admin</span>
            </li>
            <li v-for="u in others" :key="u.id">
              <label class="flex items-center gap-2 px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
                <input type="checkbox" class="accent-accent" :checked="members.includes(u.id)" @change="toggleMember(u.id)" />
                <UserAvatar :name="u.displayName" size="xs" />
                <span class="flex-1">{{ u.displayName }}</span>
                <span class="text-[11.5px] text-ink-3">{{ u.username }} su {{ u.hostname }}</span>
              </label>
            </li>
          </ul>
          <p class="border-t border-line px-2 py-1.5 text-[12px] text-ink-3">
            <template v-if="others.length === 0">Nessun altro membro ancora: gli utenti compaiono qui dopo il primo accesso al workspace.</template>
            <template v-else>{{ selectedCount }} {{ selectedCount === 1 ? 'persona scelta' : 'persone scelte' }}. Chi non è nella lista non vede il progetto, nemmeno nella barra laterale.</template>
          </p>
        </div>
        <p v-else class="mt-1.5 text-[12px] text-ink-3">Visibile a chiunque apra questo workspace con la password.</p>
      </div>

      <p v-if="error" class="text-[13px] text-danger">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton variant="ghost" @click="open = false">Annulla</BaseButton>
      <BaseButton variant="primary" @click="submit">{{ isEdit ? 'Salva modifiche' : 'Crea progetto' }}</BaseButton>
    </template>
  </BaseDialog>
</template>
