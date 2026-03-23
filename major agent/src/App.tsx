import { Routes, Route } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Entries from '@/pages/Entries';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Tasks from '@/pages/Tasks';
import Memory from '@/pages/Memory';
import Dashboard from '@/pages/Dashboard';

export default function App() {
  return (
    <>
      <Sidebar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/entries" element={<Entries />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/memory" element={<Memory />} />
      </Routes>
    </>
  );
}
