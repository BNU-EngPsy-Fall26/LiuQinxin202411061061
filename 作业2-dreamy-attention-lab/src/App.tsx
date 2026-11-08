import { useEffect } from 'react';
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { HomePage } from '@/pages/Home';
import { ExperimentSelectionPage } from '@/pages/ExperimentSelection';
import { ParticipantEntryPage } from '@/pages/ParticipantEntry';
import { InstructionsPage } from '@/pages/Instructions';
import { ExperimentRunnerPage } from '@/pages/ExperimentRunner';
import { CompletionPage } from '@/pages/Completion';
import { ResultsPage } from '@/pages/Results';
import { AboutPage } from '@/pages/About';
import { NotFoundPage } from '@/pages/NotFound';
import { ResearcherLoginPage } from '@/pages/researcher/ResearcherLogin';
import { ResearcherDashboardPage } from '@/pages/researcher/ResearcherDashboard';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="/experiments" element={<ExperimentSelectionPage />} />
          <Route path="/enter" element={<ParticipantEntryPage />} />
          <Route path="/enter/:experimentId" element={<ParticipantEntryPage />} />
          <Route path="/instructions/:experimentId" element={<InstructionsPage />} />
          <Route path="/complete/:sessionId" element={<CompletionPage />} />
          <Route path="/results/:experimentId" element={<ResultsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/researcher/login" element={<ResearcherLoginPage />} />
          <Route path="/researcher" element={<ResearcherDashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/experiment/:experimentId" element={<ExperimentRunnerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
