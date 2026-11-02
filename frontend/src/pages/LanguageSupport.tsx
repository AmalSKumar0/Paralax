import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/api';
import { Language } from '../types';
import { Topbar } from '../components/Layout/Topbar';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';
import { Button } from '../components/Common/Button';
import {
  Globe2,
  Check,
  X,
  Search,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Volume2,
  Mic,
  Cpu,
} from 'lucide-react';

export const LanguageSupport: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pair Checker state
  const [checkSource, setCheckSource] = useState('en-US');
  const [checkTarget, setCheckTarget] = useState('ja-JP');

  useEffect(() => {
    api.getLanguages()
      .then((data) => setLanguages(data.languages))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredLanguages = languages.filter((l) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
  });

  // Evaluate pair checker
  const sourceLangObj = languages.find((l) => l.code === checkSource);
  const targetLangObj = languages.find((l) => l.code === checkTarget);

  const evaluatePair = () => {
    if (!sourceLangObj || !targetLangObj) return null;
    if (checkSource === checkTarget) {
      return {
        isValid: false,
        reasons: ['Source and target languages are identical. Select distinct languages.'],
      };
    }

    const missing: string[] = [];
    if (!sourceLangObj.capabilities.stt && !sourceLangObj.capabilities.stt_batch) {
      missing.push(`Speech recognition (STT) is unavailable for source language ${sourceLangObj.name}.`);
    }
    if (!sourceLangObj.capabilities.translate) {
      missing.push(`Machine translation is unavailable for source language ${sourceLangObj.name}.`);
    }
    if (!sourceLangObj.valid_targets.includes(checkTarget)) {
      missing.push(
        `Machine translation route between ${sourceLangObj.name} and ${targetLangObj.name} is not currently enabled in the translation matrix.`
      );
    }
    if (!targetLangObj.capabilities.tts && !targetLangObj.capabilities.tts_neural) {
      missing.push(`Speech synthesis (TTS) voices are unavailable for target language ${targetLangObj.name}.`);
    }

    return {
      isValid: missing.length === 0,
      reasons: missing,
    };
  };

  const pairEvaluation = evaluatePair();

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="Language Support & Pair Checker"
        subtitle="Supported language capabilities, neural voice inventory, and bidirectional pair validation"
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-8 max-w-[1400px]">
        {/* Pair Checker Interactive Widget */}
        <Card variant="light" className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b-[3px] border-black">
            <Sparkles className="w-5 h-5 text-amber-600" />
            <h2 className="font-display text-2xl font-black text-[#1a1a1a]">
              Language Pair Verification Tool
            </h2>
          </div>

          <p className="text-xs font-semibold text-gray-700">
            Pick a source and target language to test whether translation pipelines, voice recognition (STT), and neural voice synthesis (TTS) can link successfully.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
            {/* Source */}
            <div className="sm:col-span-2">
              <label htmlFor="pair-checker-source" className="block text-xs font-black uppercase tracking-wider text-black mb-1">
                Source Language (Speaker)
              </label>
              <select
                id="pair-checker-source"
                aria-label="Source Language (Speaker)"
                value={checkSource}
                onChange={(e) => setCheckSource(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-[3px] border-black bg-[#f9f6f0] font-bold text-sm focus:bg-white focus:outline-none"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Arrow Divider */}
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full border-[2px] border-black bg-[#ffc86b] flex items-center justify-center shadow-[2px_2px_0px_#000]">
                <ArrowRight className="w-5 h-5 text-black" />
              </div>
            </div>

            {/* Target */}
            <div className="sm:col-span-2">
              <label htmlFor="pair-checker-target" className="block text-xs font-black uppercase tracking-wider text-black mb-1">
                Target Language (Translation)
              </label>
              <select
                id="pair-checker-target"
                aria-label="Target Language (Translation)"
                value={checkTarget}
                onChange={(e) => setCheckTarget(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-[3px] border-black bg-[#f9f6f0] font-bold text-sm focus:bg-white focus:outline-none"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Validation Result Banner */}
          {pairEvaluation && (
            <div
              className={`p-4 rounded-2xl border-[3px] border-black ${
                pairEvaluation.isValid
                  ? 'bg-[#eafff1] shadow-[4px_4px_0px_#22c55e]'
                  : 'bg-[#ffecec] shadow-[4px_4px_0px_#ef4444]'
              }`}
            >
              <div className="flex items-center gap-2 font-black text-sm">
                {pairEvaluation.isValid ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                    <span className="text-emerald-950">
                      Language Pair Supported: {checkSource} ➔ {checkTarget} is Fully Operational
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-700" />
                    <span className="text-rose-950">
                      Language Pair Unsupported: Capability Requirements Missing
                    </span>
                  </>
                )}
              </div>

              {pairEvaluation.isValid ? (
                <p className="mt-1 text-xs font-semibold text-emerald-900 ml-7">
                  Speech recognition, neural translation model, and Polly voice synthesis are verified and ready for hardware deployment.
                </p>
              ) : (
                <ul className="mt-2 text-xs font-semibold text-rose-900 list-disc list-inside ml-7 space-y-1">
                  {pairEvaluation.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        {/* Matrix of Languages & Capabilities */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-black text-[#1a1a1a]">
                Global Language Matrix
              </h2>
              <p className="text-xs font-semibold text-gray-600">
                Detailed capability breakdown and neural voice profiles per supported locale
              </p>
            </div>

            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search language name or code..."
                className="w-full pl-10 pr-4 py-2 rounded-full border-[2px] border-black bg-white font-bold text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc86b] shadow-[2px_2px_0px_#000]"
              />
            </div>
          </div>

          <div className="bg-white border-[3px] border-black rounded-[2rem] shadow-[6px_6px_0px_0px_#000] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-[3px] border-black bg-[#f9f6f0] text-[11px] font-black uppercase tracking-wider text-black">
                    <th className="py-3.5 px-5">Language & Code</th>
                    <th className="py-3.5 px-4 text-center">Speech Recognition (STT)</th>
                    <th className="py-3.5 px-4 text-center">Auto-Detect (Lang ID)</th>
                    <th className="py-3.5 px-4 text-center">Machine Translate</th>
                    <th className="py-3.5 px-4 text-center">Neural TTS</th>
                    <th className="py-3.5 px-5">Available Voices</th>
                  </tr>
                </thead>
                <tbody className="divide-y-[2px] divide-black/10 text-xs font-semibold">
                  {filteredLanguages.map((lang) => (
                    <tr key={lang.code} className="hover:bg-[#ffc86b]/15 transition-colors">
                      {/* Name & Code */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <span className="font-extrabold text-[#1a1a1a] text-sm">
                            {lang.name}
                          </span>
                          <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded border border-black bg-[#f0ece1]">
                            {lang.code}
                          </span>
                        </div>
                      </td>

                      {/* STT */}
                      <td className="py-4 px-4 text-center">
                        {lang.capabilities.stt || lang.capabilities.stt_streaming || lang.capabilities.stt_batch ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-[#4ade80] text-black">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-gray-200 text-gray-500">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>

                      {/* Lang ID */}
                      <td className="py-4 px-4 text-center">
                        {lang.capabilities.stt || lang.capabilities.stt_language_id ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-[#4ade80] text-black">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-gray-200 text-gray-500">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>

                      {/* Translate */}
                      <td className="py-4 px-4 text-center">
                        {lang.capabilities.translate ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-[#4ade80] text-black">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-gray-200 text-gray-500">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>

                      {/* TTS */}
                      <td className="py-4 px-4 text-center">
                        {lang.capabilities.tts || lang.capabilities.tts_neural ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-[#4ade80] text-black">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-black bg-gray-200 text-gray-500">
                            <X className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>

                      {/* Voices list */}
                      <td className="py-4 px-5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lang.voices.map((v) => (
                            <span
                              key={v.id}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-black bg-white"
                            >
                              {v.name}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
