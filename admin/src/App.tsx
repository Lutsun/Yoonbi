import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import Layout from './Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OperatorsPage from './pages/OperatorsPage';
import LinesPage from './pages/LinesPage';
import LineDetailPage from './pages/LineDetailPage';
import StopsPage from './pages/StopsPage';
import UsersPage from './pages/UsersPage';
import ContributionsPage from './pages/ContributionsPage';
import ContributionDetailPage from './pages/ContributionDetailPage';
import ReportsPage from './pages/ReportsPage';
import ReportDetailPage from './pages/ReportDetailPage';

function Gate() {
  const { access } = useAuth();

  if (access === 'checking') {
    return <div className="centered-state">Chargement…</div>;
  }
  if (access === 'signed-out' || access === 'not-admin') {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="operateurs" element={<OperatorsPage />} />
        <Route path="lignes" element={<LinesPage />} />
        <Route path="lignes/:lineId" element={<LineDetailPage />} />
        <Route path="arrets" element={<StopsPage />} />
        <Route path="utilisateurs" element={<UsersPage />} />
        <Route path="contributions" element={<ContributionsPage />} />
        <Route path="contributions/:submissionId" element={<ContributionDetailPage />} />
        <Route path="signalements" element={<ReportsPage />} />
        <Route path="signalements/:reportId" element={<ReportDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
