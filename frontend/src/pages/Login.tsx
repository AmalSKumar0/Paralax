import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import { Button } from '../components/Common/Button';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

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

  return (
    <div className="min-h-screen bg-[#f8f6f0] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Neo-Brutalist Grid Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#121212 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Main Neo-Brutalist Card */}
        <div className="bg-white border-2 border-[#121212] rounded-2xl p-8 sm:p-9 shadow-[6px_6px_0px_#121212]">
          {/* Header */}
          <div className="text-center pb-6 mb-6 border-b-2 border-[#121212]">
            <div className="inline-flex items-center gap-2 mb-1.5">
              <span className="text-3xl font-black text-[#121212] tracking-tight">
                paralax
              </span>
              <span className="w-3 h-3 rounded-full bg-[#ffc86b] border border-[#121212]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#4a4a4a]">
              IoT Two-Way Voice Translator Cloud
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#121212] mb-1.5">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#121212] absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@paralax.io"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-[#121212] rounded-xl bg-[#fffdfa] text-sm text-[#121212] font-semibold focus:bg-[#ffc86b]/10 focus:outline-none shadow-[2px_2px_0px_#121212] transition-all placeholder:text-[#888888]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#121212] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#121212] absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-[#121212] rounded-xl bg-[#fffdfa] text-sm text-[#121212] font-semibold focus:bg-[#ffc86b]/10 focus:outline-none shadow-[2px_2px_0px_#121212] transition-all placeholder:text-[#888888]"
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
        </div>
      </div>
    </div>
  );
};
