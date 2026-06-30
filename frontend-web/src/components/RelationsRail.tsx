import type { ReactNode } from 'react'
import { FolderKanban, Tag } from 'lucide-react'
import { EntityChip } from '@web/components/EntityChip'
import type { ProjectItem } from '@/lib/types'

export function todoRelationChips(t: ProjectItem): ReactNode[] {
  const chips: ReactNode[] = []
  if (t.project) chips.push(
    <EntityChip key="p" to={`/project/${t.project}`} icon={FolderKanban} label={t.project_name || t.project}
      preview={<div className="space-y-1"><div className="font-medium">{t.project_name}</div>
        {t.project_owner_name && <div className="text-xs text-muted">Owner: {t.project_owner_name}</div>}
        {t.project_leader_name && <div className="text-xs text-muted">Leader: {t.project_leader_name}</div>}</div>} />)
  if (t.assigned_to) chips.push(
    <EntityChip key="a" avatarName={t.assigned_to_name ?? '—'} image={t.assigned_to_image ?? undefined} label={t.assigned_to_name ?? 'Unassigned'} />)
  if (t.brand) chips.push(<EntityChip key="b" icon={Tag} label={t.brand} />)
  return chips
}
