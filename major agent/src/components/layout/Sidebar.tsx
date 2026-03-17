import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  CheckSquare,
  Brain,
} from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/entries', label: 'Entradas', icon: Inbox },
  { to: '/projects', label: 'Projetos', icon: FolderKanban },
  { to: '/tasks', label: 'Tarefas', icon: CheckSquare },
  { to: '/memory', label: 'Memória', icon: Brain },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="p-5 border-b border-zinc-800">
        <h1 className="text-lg font-semibold text-white tracking-tight">
          BaseOp
        </h1>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600">
        BaseOp MVP
      </div>
    </aside>
  );
}
