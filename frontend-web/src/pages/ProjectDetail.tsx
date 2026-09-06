import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { useProjectDetail } from '@/hooks/useData'
import { Spinner, EmptyState } from '@/components/ui'
import { ListChecks } from 'lucide-react'

// Legacy standalone deep-link target. The real page is the nested
// /project/:project/detail/:name route (ProjectDetailPane, split-screen with
// the project rail) — this just resolves the owning project and bounces
// there, so links built before the merge (notifications, reports, command
// palette, todo menus, bookmarks) keep working.
export default function ProjectDetail() {
  const { name = '', itemName } = useParams()
  const id = safeDecode(name)
  const nav = useNavigate()
  const detail = useProjectDetail(id, false)

  useEffect(() => {
    if (!detail.data) return
    const base = `/project/${encodeURIComponent(detail.data.project)}/detail/${encodeURIComponent(id)}`
    nav(itemName ? `${base}/item/${encodeURIComponent(itemName)}` : base, { replace: true })
  }, [detail.data, id, itemName, nav])

  if (detail.isError) {
    return <EmptyState icon={ListChecks} title="Couldn't load detail" />
  }
  return (
    <div className="flex justify-center py-20">
      <Spinner />
    </div>
  )
}
