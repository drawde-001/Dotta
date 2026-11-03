import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { setCurrentUser } from '@/lib/user';

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
    <div className="fixed inset-0 z-50 h-screen w-screen m-0 p-0 rounded-none border-none select-none font-sans overflow-hidden grid grid-cols-1 lg:grid-cols-2 bg-[#0a0a0b]">
      {/* Left Column: Outer Black Frame containing the Green Card */}
      <div className="h-full w-full p-3 sm:p-4 lg:p-5 bg-[#0a0a0b] flex flex-col">
        <div className="relative flex h-full w-full flex-col justify-end overflow-hidden rounded-[20px] sm:rounded-[24px] p-8 sm:p-10 lg:p-12 pb-10 sm:pb-12 text-white bg-[radial-gradient(120%_120%_at_30%_20%,#1f7a6b_0%,#0f2a24_60%,#0b1a16_100%)] shadow-2xl">
          {/* Subtle Ambient Radial Glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_70%_30%,rgba(255,255,255,0.08),transparent)]" />

          {/* Content: Title & Subtitle + Step Cards */}
          <div className="relative z-10 w-full max-w-[560px]">
            {/* Title & Subtitle without artificial line breaks, properly scaled on large screens */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
              Get Started with Us
            </h1>
            <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed max-w-md">
              Complete these easy steps to register your account.
            </p>

            {/* Step Indicator Cards */}
            <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Step 1: Active Card */}
              <div className="rounded-xl p-4 bg-white text-[#0b1a16] shadow-lg flex flex-col justify-between min-h-[92px] transition-all">
                <div className="text-[11px] mb-2 font-bold opacity-90">1</div>
                <div className="text-sm font-medium leading-snug">Sign up your account</div>
              </div>

              {/* Step 2: Set up your bio */}
              <div className="rounded-xl p-4 bg-white/[0.08] text-white/70 backdrop-blur-sm flex flex-col justify-between min-h-[92px] transition-all">
                <div className="text-[11px] mb-2 opacity-70">2</div>
                <div className="text-sm leading-snug">Set up your bio</div>
              </div>

              {/* Step 3: Add your API key */}
              <div className="rounded-xl p-4 bg-white/[0.08] text-white/70 backdrop-blur-sm flex flex-col justify-between min-h-[92px] transition-all">
                <div className="text-[11px] mb-2 opacity-70">3</div>
                <div className="text-sm leading-snug">Add your API key</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Form Side (Center-aligned layout) */}
      <div className="relative flex h-full w-full flex-col justify-center items-center overflow-y-auto bg-[#0a0a0b] p-6 sm:p-10 lg:p-12">
        <div className="max-w-[380px] mx-auto w-full">
          {/* Header */}
          <h2 className="text-white text-xl sm:text-2xl font-semibold">
            {mode === 'signup' ? 'Sign Up Account' : 'Log In Account'}
          </h2>
          <p className="text-sm text-white/50 mt-1">
            {mode === 'signup'
              ? 'Enter your personal data to create your account.'
              : 'Enter your credentials to access your account.'}
          </p>

          {/* Error Notification */}
          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 animate-in fade-in duration-150">
              <AlertCircle size={14} className="shrink-0" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {/* Form with input-dark styling from sign-up.html */}
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="eg. John"
                    className="w-full h-9 rounded-md px-3 text-sm text-white bg-white/[0.06] border border-white/[0.08] placeholder:text-white/40 outline-none transition hover:border-white/20 focus:border-white/50 focus:ring-1 focus:ring-white/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="eg. Francisco"
                    className="w-full h-9 rounded-md px-3 text-sm text-white bg-white/[0.06] border border-white/[0.08] placeholder:text-white/40 outline-none transition hover:border-white/20 focus:border-white/50 focus:ring-1 focus:ring-white/30"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-white/60 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'signup' ? 'eg. johnfrancis@gmail.com' : 'eg. eddy@dotta.ai'}
                required
                className="w-full h-9 rounded-md px-3 text-sm text-white bg-white/[0.06] border border-white/[0.08] placeholder:text-white/40 outline-none transition hover:border-white/20 focus:border-white/50 focus:ring-1 focus:ring-white/30"
              />
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full h-9 rounded-md px-3 pr-9 text-sm text-white bg-white/[0.06] border border-white/[0.08] placeholder:text-white/40 outline-none transition hover:border-white/20 focus:border-white/50 focus:ring-1 focus:ring-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition cursor-pointer p-0.5"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {mode === 'signup' && (
                <p className="text-[11px] text-white/40 mt-1">Must be at least 8 characters.</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 rounded-md bg-white text-black font-medium text-sm mt-2 hover:bg-white/90 active:scale-[0.99] disabled:opacity-50 transition cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{mode === 'signup' ? 'Sign up' : 'Log in'}</span>
              )}
            </button>
          </form>

          {/* Mode Switcher */}
          <p className="text-[12px] text-white/50 text-center mt-6">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="text-white underline underline-offset-2 hover:text-white/80 transition cursor-pointer ml-1"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="text-white underline underline-offset-2 hover:text-white/80 transition cursor-pointer ml-1"
                >
                  Sign up
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
