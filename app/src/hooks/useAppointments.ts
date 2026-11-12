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
export function useBlocksRange(start: Date, end: Date) {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const q = useMemo(
    () =>
      query(
        collection(db, 'agendaBlocks'),
        where('date', '>=', Timestamp.fromMillis(startMs)),
        where('date', '<=', Timestamp.fromMillis(endMs)),
        orderBy('date', 'asc'),
      ),
    [startMs, endMs],
  )
  return useCollection<AgendaBlock>(q)
}

export function useAppointmentsRange(start: Date, end: Date) {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const q = useMemo(
    () =>
      query(
        collection(db, 'appointments'),
        where('date', '>=', Timestamp.fromMillis(startMs)),
        where('date', '<=', Timestamp.fromMillis(endMs)),
        orderBy('date', 'asc'),
      ),
    [startMs, endMs],
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
