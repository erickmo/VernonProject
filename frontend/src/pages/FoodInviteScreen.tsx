import { useParams, useNavigate } from 'react-router-dom'
import { useFoodInvite } from '@/hooks/useData'
import { FoodInviteModal } from '@/components/FoodInviteModal'

// The shared-link / push-tap landing. Loads one invite and shows the same modal.
export default function FoodInviteScreen() {
  const { name } = useParams()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useFoodInvite(name)
  if (isLoading) return <div className="p-10 text-center text-slate-400">Memuat undangan…</div>
  if (isError || !data) return <div className="p-10 text-center text-slate-400">Undangan tidak ditemukan.</div>
  return <FoodInviteModal invite={data} onDone={() => navigate('/')} />
}
