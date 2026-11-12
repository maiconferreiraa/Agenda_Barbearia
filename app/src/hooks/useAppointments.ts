import { useMemo } from 'react'
import {
  collection,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from './useCollection'
import type { Appointment, CanceledAppointment, AgendaBlock } from '../types'

/** Todos os agendamentos dentro de um intervalo de datas (visão do dono). */
/** Cancelamentos do período (pela data em que o horário seria). */
export function useCanceledRange(start: Date, end: Date) {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const q = useMemo(
    () =>
      query(
        collection(db, 'canceledAppointments'),
        where('date', '>=', Timestamp.fromMillis(startMs)),
        where('date', '<=', Timestamp.fromMillis(endMs)),
        orderBy('date', 'asc'),
      ),
    [startMs, endMs],
  )
  return useCollection<CanceledAppointment>(q)
}

/** Bloqueios da agenda no período (só o dono lê). */
export function useBlocksRange(start: Date, end: Date, enabled = true) {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const q = useMemo(
    () =>
      !enabled ? null : query(
        collection(db, 'agendaBlocks'),
        where('date', '>=', Timestamp.fromMillis(startMs)),
        where('date', '<=', Timestamp.fromMillis(endMs)),
        orderBy('date', 'asc'),
      ),
    [startMs, endMs, enabled],
  )
  return useCollection<AgendaBlock>(q)
}

export function useAppointmentsRange(start: Date, end: Date, enabled = true) {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const q = useMemo(
    () =>
      !enabled ? null : query(
        collection(db, 'appointments'),
        where('date', '>=', Timestamp.fromMillis(startMs)),
        where('date', '<=', Timestamp.fromMillis(endMs)),
        orderBy('date', 'asc'),
      ),
    [startMs, endMs, enabled],
  )
  return useCollection<Appointment>(q)
}

/** Agendamentos futuros de um cliente específico. */
export function useClientAppointments(clientId: string | undefined) {
  const q = useMemo(
    () =>
      clientId
        ? query(
            collection(db, 'appointments'),
            where('clientId', '==', clientId),
            orderBy('date', 'desc'),
          )
        : null,
    [clientId],
  )
  return useCollection<Appointment>(q)
}

/** Colaborador: todos os horários da agenda dele (filtra por data na tela; não precisa de índice). */
export function useBarberAppointments(barberId: string | undefined) {
  const q = useMemo(
    () => (barberId ? query(collection(db, 'appointments'), where('barberId', '==', barberId)) : null),
    [barberId],
  )
  return useCollection<Appointment>(q)
}

/** Colaborador: bloqueios dele + os da barbearia toda (feriados, dia fechado). */
export function useBarberBlocks(barberId: string | undefined) {
  const mine = useCollection<AgendaBlock>(
    useMemo(() => (barberId ? query(collection(db, 'agendaBlocks'), where('barberId', '==', barberId)) : null), [barberId]),
  )
  const shop = useCollection<AgendaBlock>(
    useMemo(() => (barberId ? query(collection(db, 'agendaBlocks'), where('barberId', '==', null)) : null), [barberId]),
  )
  return { data: [...mine.data, ...shop.data], loading: mine.loading || shop.loading }
}
