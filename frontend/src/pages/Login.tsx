import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Lock, Mail, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '../components/Common/Button';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('admin@paralax.io');
  const [password, setPassword] = useState('Paralax123!');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      error('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      success('Logged in successfully');
      navigate('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setEmail('admin@paralax.io');
    setPassword('Paralax123!');
    setIsLoading(true);
    try {
      await login('admin@paralax.io', 'Paralax123!');
      success('Signed in as Demo Administrator');
      navigate('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Demo sign in failed';
      error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffdf8] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Neo-Brutalist Background Elements */}
      <div className="absolute top-12 left-12 w-28 h-28 rounded-full border-[3px] border-black bg-[#ffc86b] -z-0 opacity-40 shadow-[4px_4px_0px_#000]" />
      <div className="absolute bottom-16 right-16 w-36 h-36 rounded-3xl border-[3px] border-black bg-[#f4b942] -z-0 opacity-40 rotate-12 shadow-[6px_6px_0px_#000]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white border-[4px] border-black rounded-[2.5rem] p-8 shadow-[12px_12px_0px_0px_#000000]">
          {/* Header */}
          <div className="text-center pb-6 mb-6 border-b-[3px] border-black">
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="font-display text-5xl font-black text-[#1a1a1a] tracking-wider">
                paralax
              </span>
              <span className="w-3.5 h-3.5 rounded-full bg-[#ffc86b] border-[2px] border-black" />
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-700">
              IoT Two-Way Voice Translator Cloud
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@paralax.io"
                  required
                  className="w-full pl-10 pr-4 py-3 border-[3px] border-black rounded-xl bg-[#f9f6f0] font-semibold text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc86b] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-4 py-3 border-[3px] border-black rounded-xl bg-[#f9f6f0] font-semibold text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc86b] transition-all"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-2"
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Dashboard
            </Button>
          </form>

          {/* Quick Demo Login Preset Button */}
          <div className="mt-6 pt-6 border-t-[3px] border-black">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl border-[3px] border-black bg-[#f0ece1] hover:bg-[#e5e0d3] active:translate-y-[2px] transition-all text-xs font-black text-black flex items-center justify-center gap-2 shadow-[3px_3px_0px_0px_#000] cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Instant Demo Admin Login</span>
            </button>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-gray-600">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Cognito JWT Authentication · Mock Supported</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
