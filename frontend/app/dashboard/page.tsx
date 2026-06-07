'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  CheckSquare,
  Plus,
  Trash2,
  User,
  Clock,
  Check,
  LogOut,
  Play,
  CheckCircle2,
  Users,
  AlertCircle,
  Inbox
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_by: string;
  assigned_to?: string;
  created_at: string;
  completed_at?: string;
  created_by_profile: UserProfile;
  assigned_to_profile?: UserProfile;
}

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      setSession(session);
      setCurrentUser(session.user);
      await loadData(session.access_token);
    }
    init();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (event === 'SIGNED_OUT') {
          router.push('/');
        } else if (currentSession) {
          setSession(currentSession);
          setCurrentUser(currentSession.user);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const loadData = async (token: string) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch Tasks and Users from Flask Backend in parallel
      const [tasksRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/tasks`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/users`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!tasksRes.ok || !usersRes.ok) {
        throw new Error('Failed to load data from backend server.');
      }

      const tasksData = await tasksRes.json();
      const usersData = await usersRes.json();

      setTasks(tasksData);
      setUsers(usersData);
    } catch (err: any) {
      console.error(err);
      setError('Could not connect to the backend server. Please verify the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          assigned_to: newAssignedTo || null
        })
      });

      if (!res.ok) {
        throw new Error('Failed to create task');
      }

      // Reload data to reflect task creation and updated assignments
      await loadData(session.access_token);
      
      // Reset form
      setNewTitle('');
      setNewDescription('');
      setNewAssignedTo('');
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Error creating task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        throw new Error('Failed to update task status');
      }

      // Reload data to refresh tasks list
      await loadData(session.access_token);
    } catch (err: any) {
      setError(err.message || 'Error updating status');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      setError(null);
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) {
        throw new Error('Failed to delete task');
      }

      // Update state directly for smooth UI transition
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err: any) {
      setError(err.message || 'Error deleting task');
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (loading && tasks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-slate-400 font-medium">Fetching dashboard tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#0d1321]/90 backdrop-blur-md px-6 py-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-md">
              <CheckSquare className="h-5 w-5" />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              TaskHub
            </span>
          </div>

          {/* User Profile and Logout */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-slate-900/50 py-1.5 pl-2.5 pr-4 rounded-full border border-slate-800/80">
              {currentUser?.user_metadata?.avatar_url ? (
                <img
                  src={currentUser.user_metadata.avatar_url}
                  alt={currentUser.user_metadata.full_name || 'Avatar'}
                  className="w-7 h-7 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-semibold">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-200">
                  {currentUser?.user_metadata?.full_name || currentUser?.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-red-500/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Backend Connection Issue</p>
              <p className="mt-1 text-red-400/80">{error}</p>
            </div>
          </div>
        )}

        {/* Dashboard Title & Create Button */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">My Tasks</h1>
            <p className="text-sm text-slate-400 mt-1">Manage and assign tasks across your workspace</p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-indigo-600 hover:to-violet-700 shadow-indigo-500/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Create Task
          </button>
        </div>

        {/* Task Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Pending */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/20 p-5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h2 className="font-bold text-slate-200">Pending</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400">
                {pendingTasks.length}
              </span>
            </div>

            <div className="flex-grow space-y-4">
              {pendingTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUser={currentUser}
                  onStatusChange={handleUpdateStatus}
                  onDelete={handleDeleteTask}
                />
              ))}

              {pendingTasks.length === 0 && <EmptyColumnState message="No pending tasks" />}
            </div>
          </div>

          {/* Column 2: In Progress */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/20 p-5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <h2 className="font-bold text-slate-200">In Progress</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400">
                {inProgressTasks.length}
              </span>
            </div>

            <div className="flex-grow space-y-4">
              {inProgressTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUser={currentUser}
                  onStatusChange={handleUpdateStatus}
                  onDelete={handleDeleteTask}
                />
              ))}

              {inProgressTasks.length === 0 && <EmptyColumnState message="No tasks in progress" />}
            </div>
          </div>

          {/* Column 3: Completed */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/20 p-5 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h2 className="font-bold text-slate-200">Completed</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400">
                {completedTasks.length}
              </span>
            </div>

            <div className="flex-grow space-y-4">
              {completedTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUser={currentUser}
                  onStatusChange={handleUpdateStatus}
                  onDelete={handleDeleteTask}
                />
              ))}

              {completedTasks.length === 0 && <EmptyColumnState message="No completed tasks" />}
            </div>
          </div>
        </div>
      </main>

      {/* Task Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0d1321] p-6 shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-4">Create New Task</h3>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="What needs to be done?"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Provide details about the task..."
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Assign To
                </label>
                <select
                  value={newAssignedTo}
                  onChange={e => setNewAssignedTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Unassigned (Self-assigned)</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email}) {u.id === currentUser?.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-indigo-400/80 mt-1 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Assigning sends an automatic email notification via Gmail.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:from-indigo-600 hover:to-violet-700 active:scale-[0.98] transition-all disabled:opacity-75 cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* Subcomponents for task organization */
function TaskCard({
  task,
  currentUser,
  onStatusChange,
  onDelete
}: {
  task: Task;
  currentUser: any;
  onStatusChange: (id: string, status: 'pending' | 'in_progress' | 'completed') => void;
  onDelete: (id: string) => void;
}) {
  const isCreator = task.created_by === currentUser?.id;
  const isAssignee = task.assigned_to === currentUser?.id;

  return (
    <div className="group relative rounded-xl border border-slate-800/80 bg-[#0d1321]/50 p-4 hover:border-slate-700/80 hover:bg-[#0d1321] transition-all shadow-md">
      {/* Title */}
      <div className="flex justify-between items-start mb-1.5">
        <h4 className="font-bold text-slate-100 text-sm group-hover:text-white transition-colors break-words max-w-[80%]">
          {task.title}
        </h4>
        {isCreator && (
          <button
            onClick={() => onDelete(task.id)}
            className="text-slate-500 hover:text-red-400 transition-colors p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-500/10 cursor-pointer"
            title="Delete Task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-3 break-words">
          {task.description}
        </p>
      )}

      {/* User Badges */}
      <div className="flex flex-wrap gap-1.5 mb-4 items-center">
        {/* Creator Badge */}
        <span className="text-[10px] py-0.5 px-2 rounded-md bg-slate-800 text-slate-400 flex items-center gap-1 border border-slate-800/80">
          <Clock className="w-2.5 h-2.5" />
          By: {task.created_by_profile?.full_name?.split(' ')[0] || 'Unknown'}
        </span>

        {/* Assignee Badge */}
        {task.assigned_to_profile ? (
          <span className={`text-[10px] py-0.5 px-2 rounded-md flex items-center gap-1 border ${
            isAssignee
              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20 font-medium'
              : 'bg-slate-800 text-slate-400 border-slate-800/80'
          }`}>
            <User className="w-2.5 h-2.5" />
            {isAssignee ? 'Assigned to You' : `Assigned: ${task.assigned_to_profile.full_name.split(' ')[0]}`}
          </span>
        ) : (
          <span className="text-[10px] py-0.5 px-2 rounded-md bg-slate-800/30 text-slate-500 italic border border-slate-800/20">
            Unassigned
          </span>
        )}
      </div>

      {/* Action Progress Buttons */}
      <div className="flex justify-end gap-1.5 border-t border-slate-800/60 pt-3 mt-1">
        {task.status === 'pending' && (
          <button
            onClick={() => onStatusChange(task.id, 'in_progress')}
            className="flex items-center gap-1 text-[10px] font-bold py-1 px-2.5 rounded-lg border border-slate-800 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all cursor-pointer"
          >
            <Play className="h-3 w-3" /> Start Progress
          </button>
        )}

        {task.status === 'in_progress' && (
          <button
            onClick={() => onStatusChange(task.id, 'completed')}
            className="flex items-center gap-1 text-[10px] font-bold py-1 px-2.5 rounded-lg border border-slate-800 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all cursor-pointer"
          >
            <Check className="h-3 w-3" /> Complete Task
          </button>
        )}

        {task.status === 'completed' && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/5 px-2.5 py-1 rounded-lg border border-emerald-500/10">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyColumnState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-slate-800/50 bg-slate-900/10 text-center h-[200px]">
      <Inbox className="h-8 w-8 text-slate-600 mb-2 stroke-[1.5]" />
      <p className="text-xs font-semibold text-slate-500">{message}</p>
    </div>
  );
}
