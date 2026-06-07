'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogIn, CheckSquare, Sparkles } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      } else {
        setLoading(false);
      }
    }
    checkUser();
  }, [router]);

  const handleGoogleLogin = async () => {
    try {
      setIsSigningIn(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Redirect to /dashboard after successful login
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error logging in with Google:', error);
      setIsSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-slate-400 font-medium animate-pulse">Loading TaskHub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0b0f19] px-4">
      {/* Decorative gradient backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />

      {/* Main glassmorphic card */}
      <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/40 p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center">
          {/* Logo Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 mb-6">
            <CheckSquare className="h-8 w-8" />
          </div>

          {/* Heading */}
          <h1 id="landing-title" className="text-4xl font-extrabold tracking-tight text-white mb-2 bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            TaskHub
          </h1>
          <p className="text-sm font-semibold text-indigo-400 tracking-wider uppercase mb-6 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" /> Seamless Task Assignment
          </p>

          <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm">
            Collaborative task management for teams. Sign in with your Gmail account to manage tasks, assign them to teammates, and receive instant email updates.
          </p>

          {/* Google Login Button */}
          <button
            id="google-login-btn"
            onClick={handleGoogleLogin}
            disabled={isSigningIn}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-slate-900 shadow-md transition-all duration-200 hover:bg-slate-50 hover:shadow-lg hover:shadow-white/5 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
          >
            {isSigningIn ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 0, 0)">
                  <path d="M21.35,11.1H12v2.7h5.38C17.1,14.9 16.1,15.9 14.63,16.85l2.3,1.78c2.6-2.4 4.12-5.93 4.12-10.03C21.35,12 21.35,11.55 21.35,11.1z" fill="#4285F4" />
                  <path d="M12,20.5c2.3,0 4.23-0.76 5.63-2.08l-2.3-1.78c-0.64,0.43-1.46,0.68-2.33,0.68c-2.22,0-4.1-1.5-4.77-3.53l-2.38,1.84C7.3,18.3 9.43,20.5 12,20.5z" fill="#34A853" />
                  <path d="M7.23,13.8c-0.17-0.5-0.27-1.05-0.27-1.6s0.1-1.1,0.27-1.6L4.85,8.75C4.3,9.85 4,11.1 4,12.2s0.3,2.35,0.85,3.45L7.23,13.8z" fill="#FBBC05" />
                  <path d="M12,6.5c1.25,0 2.38,0.43 3.27,1.28l2.45-2.45C16.22,3.9 14.3,3.1 12,3.1C9.43,3.1 7.3,5.3 5.8,7.95l2.38,1.84C8.85,7.76 10.73,6.5 12,6.5z" fill="#EA4335" />
                </g>
              </svg>
            )}
            <span className="font-semibold text-slate-800">
              {isSigningIn ? 'Redirecting to Google...' : 'Continue with Google'}
            </span>
          </button>
        </div>
      </div>

      {/* Footer / Stack notice */}
      <div className="absolute bottom-6 text-center text-xs text-slate-600">
        Built with Next.js • Flask • Supabase • Gmail API
      </div>
    </div>
  );
}
