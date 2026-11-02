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
    <div className="min-h-screen bg-[#edeae4] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle Warm Amber Background Aura */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#e9b140]/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#dfa32b]/15 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white border border-[#ded7cc] rounded-3xl p-8 sm:p-9 shadow-[0_12px_40px_rgba(43,29,22,0.07)]">
          {/* Header */}
          <div className="text-center pb-6 mb-6 border-b border-[#ded7cc]">
            <div className="inline-flex items-center gap-2 mb-1.5">
              <span className="text-3xl font-bold text-[#2b1d16] tracking-tight">
                paralax
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#e9b140]" />
            </div>
            <p className="text-xs text-[#8a776a]">
              IoT Two-Way Voice Translator Cloud
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#5c4a3e] mb-1.5">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8a776a] absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@paralax.io"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-[#ded7cc] rounded-xl bg-[#f7f5f0] text-sm text-[#2b1d16] font-medium focus:bg-white focus:outline-none focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5c4a3e] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8a776a] absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-[#ded7cc] rounded-xl bg-[#f7f5f0] text-sm text-[#2b1d16] font-medium focus:bg-white focus:outline-none focus:border-[#e9b140] focus:ring-2 focus:ring-[#e9b140]/20 transition-all"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="dark"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-2"
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Dashboard
            </Button>
          </form>

          {/* Quick Demo Login Preset Button */}
          <div className="mt-6 pt-5 border-t border-[#ded7cc]">
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] hover:bg-[#eae5dd] transition-all text-xs font-semibold text-[#2b1d16] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#855b14]" />
              <span>Instant Demo Admin Login</span>
            </button>
            <div className="mt-3 flex flex-col items-center justify-center gap-1 text-[11px] text-[#8a776a]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Admin JWT Authentication</span>
              </div>
              <p className="text-[#8a776a]">
                Default: <span className="font-mono text-[#2b1d16] font-semibold">admin@paralax.io</span> / <span className="font-mono text-[#2b1d16] font-semibold">Paralax123!</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
