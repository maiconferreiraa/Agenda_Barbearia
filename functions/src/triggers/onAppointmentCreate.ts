import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { REGION } from '../lib/region'
import { notify } from '../lib/notify'

export const onAppointmentCreate = onDocumentCreated(
  { region: REGION, document: 'appointments/{appointmentId}' },
  async (event) => {
    const appointment = event.data?.data()
    if (!appointment) return

    const when = appointment.date.toDate() as Date
    const formatted = when.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

    await notify({
      type: 'appointment_new',
      targetRole: 'owner',
      relatedId: event.params.appointmentId,
      title: 'Novo agendamento',
      message: `${appointment.clientName} agendou ${appointment.serviceName} em ${formatted}.`,
    })
  },
)
