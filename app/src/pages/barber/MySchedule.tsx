import { WorkScheduleEditor } from '../../components/WorkScheduleEditor'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'

/** Colaborador: dias e horário de trabalho, almoço, folgas, férias e feriados dele. */
export function MySchedule() {
  const { profile } = useAuth()
  if (!profile) return <Spinner full />
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl text-neutral-100">Meus horários</h1>
      <WorkScheduleEditor member={profile} self />
    </div>
  )
}
