import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { RequireAuth } from './routes/RequireAuth'
import { Spinner } from './components/ui/Spinner'

import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'

import { OwnerLayout } from './components/layout/OwnerLayout'
import { Dashboard } from './pages/owner/Dashboard'
import { Agenda } from './pages/owner/Agenda'
import { Services } from './pages/owner/Services'
import { Plans } from './pages/owner/Plans'
import { Subscriptions } from './pages/owner/Subscriptions'
import { Clients } from './pages/owner/Clients'
import { Settings } from './pages/owner/Settings'

import { ClientLayout } from './components/layout/ClientLayout'
import { Book } from './pages/client/Book'
import { PlansCatalog } from './pages/client/PlansCatalog'
import { MyAppointments } from './pages/client/MyAppointments'
import { MySubscription } from './pages/client/MySubscription'

function Home() {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner full />
  if (!profile) return <Navigate to="/login" replace />
  return <Navigate to={profile.role === 'owner' ? '/owner' : '/app'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/owner"
        element={
          <RequireAuth role="owner">
            <OwnerLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="services" element={<Services />} />
        <Route path="plans" element={<Plans />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="clients" element={<Clients />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route
        path="/app"
        element={
          <RequireAuth role="client">
            <ClientLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Book />} />
        <Route path="plans" element={<PlansCatalog />} />
        <Route path="appointments" element={<MyAppointments />} />
        <Route path="subscription" element={<MySubscription />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
