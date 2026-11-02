import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { setCurrentUser } from '@/lib/user';

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function AuthScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState('signup'); // 'signup' | 'login'
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (!email.trim() || !password) {
          throw new Error('Please fill in all required fields.');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }

        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            firstName: firstName.trim(),
            lastName: lastName.trim()
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to create account.');
        }

        setCurrentUser(data.user);
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(data.user);
        }
      } else {
        // Login mode
        if (!email.trim() || !password) {
          throw new Error('Please enter your email and password.');
        }

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Invalid email or password.');
        }

        setCurrentUser(data.user);
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(data.user);
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 h-screen w-screen m-0 p-0 rounded-none border-none select-none font-sans overflow-hidden grid grid-cols-1 md:grid-cols-2 bg-[#0a0a0c]">
      {/* Left Column: Atmospheric Emerald Visual with Steps positioned in lower section */}
      <div className="relative flex h-full w-full flex-col justify-end overflow-hidden bg-gradient-to-br from-[#0c3126] via-[#07221b] to-[#03110d] p-8 sm:p-12 lg:p-16 pb-12 sm:pb-16 lg:pb-20 rounded-none border-none">
        {/* Radial ambient spotlight inside left pane */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_45%_35%,rgba(16,185,129,0.24),transparent_65%)]" />

        {/* Text + Steps grouped together in lower section exactly matching reference image */}
        <div className="relative z-10 w-full max-w-[620px] flex flex-col gap-6 sm:gap-8">
          {/* Title + Subtitle row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-semibold tracking-tight text-white leading-[1.14]">
              Get Started<br />with Us
            </h1>
            <p className="text-xs sm:text-[13px] text-emerald-100/70 sm:max-w-[170px] leading-relaxed pb-1">
              Complete these easy steps to register your account.
            </p>
          </div>

          {/* Bottom Step Indicator Cards */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
            {/* Step 1: Active Card */}
            <div className="rounded-2xl bg-white p-3.5 sm:p-4 text-zinc-900 shadow-xl flex flex-col justify-between min-h-[96px] sm:min-h-[105px] transition-all duration-200">
              <div className="flex h-5 w-5 sm:h-5.5 sm:w-5.5 items-center justify-center rounded-full bg-black text-[11px] font-bold text-white">
                1
              </div>
              <p className="text-[11.5px] sm:text-xs font-semibold text-zinc-900 leading-snug">
                Sign up your account
              </p>
            </div>

            {/* Step 2: Set up your bio */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] backdrop-blur-md p-3.5 sm:p-4 text-zinc-300 flex flex-col justify-between min-h-[96px] sm:min-h-[105px] transition-all duration-200">
              <div className="flex h-5 w-5 sm:h-5.5 sm:w-5.5 items-center justify-center rounded-full bg-white/[0.12] text-[11px] font-medium text-zinc-300">
                2
              </div>
              <p className="text-[11.5px] sm:text-xs font-medium text-zinc-300 leading-snug">
                Set up your bio
              </p>
            </div>

            {/* Step 3: Add your API key */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] backdrop-blur-md p-3.5 sm:p-4 text-zinc-300 flex flex-col justify-between min-h-[96px] sm:min-h-[105px] transition-all duration-200">
              <div className="flex h-5 w-5 sm:h-5.5 sm:w-5.5 items-center justify-center rounded-full bg-white/[0.12] text-[11px] font-medium text-zinc-300">
                3
              </div>
              <p className="text-[11.5px] sm:text-xs font-medium text-zinc-300 leading-snug">
                Add your API key
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Form */}
      <div className="relative flex h-full w-full flex-col justify-center items-center overflow-y-auto bg-[#0a0a0c] p-8 sm:p-12 lg:p-16 rounded-none border-none">
        <div className="w-full max-w-[380px] my-auto">
          {/* Header */}
          <div className="mb-6 text-center sm:text-left">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {mode === 'signup' ? 'Sign Up Account' : 'Log In Account'}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {mode === 'signup'
                ? 'Enter your personal data to create your account.'
                : 'Enter your credentials to access your account.'}
            </p>
          </div>

          {/* Error Notification */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 animate-in fade-in duration-150">
              <AlertCircle size={14} className="shrink-0" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="eg. John"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition hover:border-white/20 focus:border-white focus:ring-1 focus:ring-white/30 focus:bg-white/[0.06]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="eg. Francisco"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition hover:border-white/20 focus:border-white focus:ring-1 focus:ring-white/30 focus:bg-white/[0.06]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'signup' ? 'eg. johnfrans@gmail.com' : 'eg. eddy@omniagent.ai'}
                required
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition hover:border-white/20 focus:border-white focus:ring-1 focus:ring-white/30 focus:bg-white/[0.06]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 pr-9 text-xs text-white placeholder:text-zinc-600 outline-none transition hover:border-white/20 focus:border-white focus:ring-1 focus:ring-white/30 focus:bg-white/[0.06]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition cursor-pointer p-0.5"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Must be at least 8 characters.
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-xs font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{mode === 'signup' ? 'Sign Up' : 'Log In'}</span>
              )}
            </button>
          </form>

          {/* Social Logins placed JUST BELOW the signup button as instructed */}
          <div className="mt-4">
            <div className="relative flex items-center justify-center my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.08]" />
              </div>
              <div className="relative bg-[#0a0a0c] px-2 text-[11px] text-zinc-500">
                Or
              </div>
            </div>

            {/* Non-clickable Social Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pointer-events-none opacity-60 select-none">
              <div
                aria-disabled="true"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] py-2 px-3 text-xs font-medium text-zinc-300 cursor-not-allowed"
              >
                <GoogleIcon />
                <span>Google</span>
              </div>
              <div
                aria-disabled="true"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] py-2 px-3 text-xs font-medium text-zinc-300 cursor-not-allowed"
              >
                <GithubIcon />
                <span>Github</span>
              </div>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="mt-5 text-center text-xs text-zinc-400">
            {mode === 'signup' ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="font-medium text-white hover:underline cursor-pointer ml-1"
                >
                  Log in
                </button>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="font-medium text-white hover:underline cursor-pointer ml-1"
                >
                  Sign up
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
