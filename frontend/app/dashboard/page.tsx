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
  Inbox,
  Search,
  X,
  Pencil
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
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [selectedViewTask, setSelectedViewTask] = useState<Task | null>(null);

  // Edit form state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editAssignSearchQuery, setEditAssignSearchQuery] = useState('');
  const [isEditSuggestionsOpen, setIsEditSuggestionsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
    u.full_name.toLowerCase().includes(assignSearchQuery.toLowerCase())
  );

  const selectedAssignee = users.find(u => u.id === newAssignedTo) || null;

  const filteredEditUsers = users.filter(u =>
    u.email.toLowerCase().includes(editAssignSearchQuery.toLowerCase()) ||
    u.full_name.toLowerCase().includes(editAssignSearchQuery.toLowerCase())
  );

  const selectedEditAssignee = users.find(u => u.id === editAssignedTo) || null;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  useEffect(() => {
    let active = true;
    let dataLoaded = false;

    // Check if we are currently in an OAuth callback (hash contains access_token or error info)
    const isCallback = typeof window !== 'undefined' && 
      (window.location.hash.includes('access_token=') || 
       window.location.hash.includes('error=') || 
       window.location.hash.includes('error_description='));

    async function init() {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!active) return;

      if (initialSession) {
        setSession(initialSession);
        setCurrentUser(initialSession.user);
        if (!dataLoaded) {
          dataLoaded = true;
          await loadData(initialSession.access_token);
        }
      } else if (!isCallback) {
        // Only redirect to login page if we are NOT in the middle of a callback
        router.push('/');
      }
    }
    
    init();

    // Listen for auth state changes (e.g. when callback parses or user logs out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!active) return;

        if (event === 'SIGNED_OUT') {
          router.push('/');
        } else if (currentSession) {
          setSession(currentSession);
          setCurrentUser(currentSession.user);
          if (!dataLoaded) {
            dataLoaded = true;
            await loadData(currentSession.access_token);
          }
        }
      }
    );

    // Safety timeout: If in callback but no session is established after 5 seconds, redirect to login
    let timeoutId: any;
    if (isCallback) {
      timeoutId = setTimeout(async () => {
        if (!active) return;
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) {
          console.warn('OAuth callback timeout: No session established.');
          router.push('/');
        }
      }, 5000);
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
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
        const tasksErr = !tasksRes.ok ? await tasksRes.text() : '';
        const usersErr = !usersRes.ok ? await usersRes.text() : '';
        console.error('Fetch failed:', { tasksStatus: tasksRes.status, tasksErr, usersStatus: usersRes.status, usersErr });
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

  const handleCloseModal = () => {
    setNewTitle('');
    setNewDescription('');
    setNewAssignedTo('');
    setAssignSearchQuery('');
    setIsSuggestionsOpen(false);
    setIsModalOpen(false);
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
      
      // Reset form and close modal
      handleCloseModal();
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

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditAssignedTo(task.assigned_to || '');
    setEditAssignSearchQuery('');
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditingTask(null);
    setEditTitle('');
    setEditDescription('');
    setEditAssignedTo('');
    setEditAssignSearchQuery('');
    setIsEditSuggestionsOpen(false);
    setIsEditModalOpen(false);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    try {
      setIsUpdating(true);
      setError(null);

      const res = await fetch(`${API_URL}/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          assigned_to: editAssignedTo || null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to update task');
      }

      // Reload data to reflect changes
      await loadData(session.access_token);
      
      // Close edit modal
      handleCloseEditModal();
    } catch (err: any) {
      setError(err.message || 'Error updating task');
    } finally {
      setIsUpdating(false);
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

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
            {currentUser ? (
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
            ) : (
              <HeaderProfileSkeleton />
            )}

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
              {loading ? (
                <>
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                </>
              ) : (
                <>
                  {pendingTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUser={currentUser}
                      onStatusChange={handleUpdateStatus}
                      onDelete={handleDeleteTask}
                      onEdit={handleOpenEditModal}
                      onViewDetails={setSelectedViewTask}
                    />
                  ))}

                  {pendingTasks.length === 0 && <EmptyColumnState message="No pending tasks" />}
                </>
              )}
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
              {loading ? (
                <>
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                </>
              ) : (
                <>
                  {inProgressTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUser={currentUser}
                      onStatusChange={handleUpdateStatus}
                      onDelete={handleDeleteTask}
                      onEdit={handleOpenEditModal}
                      onViewDetails={setSelectedViewTask}
                    />
                  ))}

                  {inProgressTasks.length === 0 && <EmptyColumnState message="No tasks in progress" />}
                </>
              )}
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
              {loading ? (
                <>
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                  <TaskCardSkeleton />
                </>
              ) : (
                <>
                  {completedTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUser={currentUser}
                      onStatusChange={handleUpdateStatus}
                      onDelete={handleDeleteTask}
                      onEdit={handleOpenEditModal}
                      onViewDetails={setSelectedViewTask}
                    />
                  ))}

                  {completedTasks.length === 0 && <EmptyColumnState message="No completed tasks" />}
                </>
              )}
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
                <div className="relative">
                  {selectedAssignee ? (
                    <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-300">
                      <div className="flex items-center gap-2.5">
                        {selectedAssignee.avatar_url ? (
                          <img
                            src={selectedAssignee.avatar_url}
                            alt={selectedAssignee.full_name}
                            className="w-6 h-6 rounded-full object-cover border border-indigo-500/20"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/20">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-slate-200">{selectedAssignee.full_name}</span>
                          <span className="text-xs text-slate-400 ml-2">({selectedAssignee.email})</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewAssignedTo('');
                          setAssignSearchQuery('');
                        }}
                        className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10 cursor-pointer"
                        title="Remove assignment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search team members by email or name..."
                          value={assignSearchQuery}
                          onChange={(e) => {
                            setAssignSearchQuery(e.target.value);
                            setIsSuggestionsOpen(true);
                          }}
                          onFocus={() => setIsSuggestionsOpen(true)}
                          onBlur={() => setTimeout(() => setIsSuggestionsOpen(false), 200)}
                          className="w-full rounded-xl border border-slate-800 bg-slate-900/50 pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                      </div>

                      {isSuggestionsOpen && (
                        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-800 bg-[#0d1321]/95 backdrop-blur-md shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                          {filteredUsers.length > 0 ? (
                            <ul className="divide-y divide-slate-800/40">
                              {filteredUsers.map((u) => (
                                <li key={u.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewAssignedTo(u.id);
                                      setAssignSearchQuery('');
                                      setIsSuggestionsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-indigo-500/10 hover:text-indigo-300 transition-all text-slate-300 cursor-pointer"
                                  >
                                    {u.avatar_url ? (
                                      <img
                                        src={u.avatar_url}
                                        alt={u.full_name}
                                        className="w-7 h-7 rounded-full object-cover border border-slate-700"
                                      />
                                    ) : (
                                      <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-semibold border border-slate-700">
                                        {u.full_name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div>
                                      <p className="font-semibold text-slate-200 text-xs">
                                        {u.full_name} {u.id === currentUser?.id ? '(You)' : ''}
                                      </p>
                                      <p className="text-[10px] text-slate-400">{u.email}</p>
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="px-4 py-3 text-xs text-slate-500 italic text-center">
                              No matching team members found
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[10px] text-indigo-400/80 mt-1.5 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Assigning sends an automatic email notification via Gmail.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
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

      {/* Task Editing Modal */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0d1321] p-6 shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-4">Edit Task</h3>

            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="What needs to be done?"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="Provide details about the task..."
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Assign To
                </label>
                <div className="relative">
                  {selectedEditAssignee ? (
                    <div className="flex items-center justify-between rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-300">
                      <div className="flex items-center gap-2.5">
                        {selectedEditAssignee.avatar_url ? (
                          <img
                            src={selectedEditAssignee.avatar_url}
                            alt={selectedEditAssignee.full_name}
                            className="w-6 h-6 rounded-full object-cover border border-indigo-500/20"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/20">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-slate-200">{selectedEditAssignee.full_name}</span>
                          <span className="text-xs text-slate-400 ml-2">({selectedEditAssignee.email})</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditAssignedTo('');
                          setEditAssignSearchQuery('');
                        }}
                        className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10 cursor-pointer"
                        title="Remove assignment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search team members by email or name..."
                          value={editAssignSearchQuery}
                          onChange={(e) => {
                            setEditAssignSearchQuery(e.target.value);
                            setIsEditSuggestionsOpen(true);
                          }}
                          onFocus={() => setIsEditSuggestionsOpen(true)}
                          onBlur={() => setTimeout(() => setIsEditSuggestionsOpen(false), 200)}
                          className="w-full rounded-xl border border-slate-800 bg-slate-900/50 pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                      </div>

                      {isEditSuggestionsOpen && (
                        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-800 bg-[#0d1321]/95 backdrop-blur-md shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                          {filteredEditUsers.length > 0 ? (
                            <ul className="divide-y divide-slate-800/40">
                              {filteredEditUsers.map((u) => (
                                <li key={u.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditAssignedTo(u.id);
                                      setEditAssignSearchQuery('');
                                      setIsEditSuggestionsOpen(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-indigo-500/10 hover:text-indigo-300 transition-all text-slate-300 cursor-pointer"
                                  >
                                    {u.avatar_url ? (
                                      <img
                                        src={u.avatar_url}
                                        alt={u.full_name}
                                        className="w-7 h-7 rounded-full object-cover border border-slate-700"
                                      />
                                    ) : (
                                      <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-semibold border border-slate-700">
                                        {u.full_name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div>
                                      <p className="font-semibold text-slate-200 text-xs">
                                        {u.full_name} {u.id === currentUser?.id ? '(You)' : ''}
                                      </p>
                                      <p className="text-[10px] text-slate-400">{u.email}</p>
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="px-4 py-3 text-xs text-slate-500 italic text-center">
                              No matching team members found
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[10px] text-indigo-400/80 mt-1.5 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Assigning sends an automatic email notification via Gmail.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80 mt-6">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:from-indigo-600 hover:to-violet-700 active:scale-[0.98] transition-all disabled:opacity-75 cursor-pointer"
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedViewTask && (
        <div 
          onClick={() => setSelectedViewTask(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0d1321] p-6 shadow-2xl relative"
          >
            {/* Header / Title */}
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <h3 className="text-xl font-bold text-white break-words">{selectedViewTask.title}</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  {/* Status Badge */}
                  {selectedViewTask.status === 'pending' && (
                    <span className="text-[10px] font-bold py-0.5 px-2 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      Pending
                    </span>
                  )}
                  {selectedViewTask.status === 'in_progress' && (
                    <span className="text-[10px] font-bold py-0.5 px-2 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 animate-pulse">
                      In Progress
                    </span>
                  )}
                  {selectedViewTask.status === 'completed' && (
                    <span className="text-[10px] font-bold py-0.5 px-2 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      Completed
                    </span>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => setSelectedViewTask(null)}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer"
                title="Close Modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Description */}
            <div className="mb-6 bg-slate-950/20 border border-slate-800/40 rounded-xl p-4 min-h-[100px] max-h-[200px] overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description</p>
              <p className="text-sm text-slate-300 leading-relaxed break-words whitespace-pre-wrap">
                {selectedViewTask.description || 'No description provided.'}
              </p>
            </div>

            {/* Profiles (Creator & Assignee) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pt-4 border-t border-slate-800/40">
              {/* Creator details */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Created By</p>
                <div className="flex items-center gap-2.5">
                  {selectedViewTask.created_by_profile?.avatar_url ? (
                    <img
                      src={selectedViewTask.created_by_profile.avatar_url}
                      alt={selectedViewTask.created_by_profile.full_name}
                      className="w-8 h-8 rounded-full object-cover border border-slate-800"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/20">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-200 truncate">
                      {selectedViewTask.created_by_profile?.full_name || 'Unknown User'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {selectedViewTask.created_by_profile?.email || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Assignee details */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Assigned To</p>
                {selectedViewTask.assigned_to_profile ? (
                  <div className="flex items-center gap-2.5">
                    {selectedViewTask.assigned_to_profile.avatar_url ? (
                      <img
                        src={selectedViewTask.assigned_to_profile.avatar_url}
                        alt={selectedViewTask.assigned_to_profile.full_name}
                        className="w-8 h-8 rounded-full object-cover border border-slate-800"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold border border-slate-700">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {selectedViewTask.assigned_to_profile.full_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {selectedViewTask.assigned_to_profile.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center h-8">
                    <p className="text-xs text-slate-500 italic">Unassigned</p>
                  </div>
                )}
              </div>
            </div>

            {/* Dates & Timeline */}
            <div className="pt-4 border-t border-slate-800/40 text-[10px] text-slate-500 space-y-1">
              <p>
                <strong>Created at:</strong> {new Date(selectedViewTask.created_at).toLocaleString()}
              </p>
              {selectedViewTask.completed_at && (
                <p className="text-emerald-500/80">
                  <strong>Completed at:</strong> {new Date(selectedViewTask.completed_at).toLocaleString()}
                </p>
              )}
            </div>

            {/* Bottom Actions / Close */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/40 mt-6">
              {selectedViewTask.created_by === currentUser?.id && selectedViewTask.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() => {
                    const taskToEdit = selectedViewTask;
                    setSelectedViewTask(null);
                    handleOpenEditModal(taskToEdit);
                  }}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-indigo-500/10 hover:border-indigo-500/30 text-indigo-400 transition-all px-5 py-2 text-sm font-semibold cursor-pointer flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" /> Edit Task
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedViewTask(null)}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 shadow-md active:scale-[0.98] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
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
  onDelete,
  onEdit,
  onViewDetails
}: {
  task: Task;
  currentUser: any;
  onStatusChange: (id: string, status: 'pending' | 'in_progress' | 'completed') => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onViewDetails: (task: Task) => void;
}) {
  const isCreator = task.created_by === currentUser?.id;
  const isAssignee = task.assigned_to === currentUser?.id;

  return (
    <div 
      onClick={() => onViewDetails(task)}
      className="group relative rounded-xl border border-slate-800/80 bg-[#0d1321]/50 p-4 hover:border-slate-700/80 hover:bg-[#0d1321] transition-all shadow-md cursor-pointer hover:scale-[1.01] duration-200"
    >
      {/* Title */}
      <div className="flex justify-between items-start mb-1.5">
        <h4 className="font-bold text-slate-100 text-sm group-hover:text-white transition-colors break-words max-w-[75%]">
          {task.title}
        </h4>
        {isCreator && task.status !== 'completed' && (
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
              className="text-slate-500 hover:text-indigo-400 transition-colors p-0.5 rounded hover:bg-indigo-500/10 cursor-pointer"
              title="Edit Task"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className="text-slate-500 hover:text-red-400 transition-colors p-0.5 rounded hover:bg-red-500/10 cursor-pointer"
              title="Delete Task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
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
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(task.id, 'in_progress');
            }}
            className="flex items-center gap-1 text-[10px] font-bold py-1 px-2.5 rounded-lg border border-slate-800 text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all cursor-pointer"
          >
            <Play className="h-3 w-3" /> Start Progress
          </button>
        )}

        {task.status === 'in_progress' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(task.id, 'completed');
            }}
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

function HeaderProfileSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-slate-900/50 py-1.5 pl-2.5 pr-4 rounded-full border border-slate-800/80 animate-pulse">
      <div className="w-7 h-7 rounded-full bg-slate-800/50" />
      <div className="w-20 h-3 bg-slate-800/40 rounded" />
    </div>
  );
}

function TaskCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800/50 bg-[#0d1321]/30 p-4 animate-pulse">
      {/* Title Placeholder */}
      <div className="h-4 bg-slate-800/60 rounded w-2/3 mb-3.5" />

      {/* Description Placeholder */}
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-slate-800/40 rounded w-full" />
        <div className="h-3 bg-slate-800/40 rounded w-5/6" />
      </div>

      {/* Badges/Tags Placeholders */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <div className="w-16 h-5 bg-slate-800/50 rounded-md" />
        <div className="w-24 h-5 bg-slate-800/50 rounded-md" />
      </div>

      {/* Bottom Action buttons Placeholder */}
      <div className="flex justify-end pt-3 border-t border-slate-800/40">
        <div className="w-24 h-6.5 bg-slate-800/30 rounded-lg" />
      </div>
    </div>
  );
}
