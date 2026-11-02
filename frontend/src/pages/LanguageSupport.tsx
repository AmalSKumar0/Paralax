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

      <div className="p-6 md:p-8 space-y-6 w-full">
        {/* Pair Checker Interactive Widget */}
        <Card variant="light" className="space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-[#ded7cc]">
            <Sparkles className="w-5 h-5 text-[#e9b140]" />
            <h2 className="text-lg font-bold text-[#2b1d16]">
              Language Pair Verification Tool
            </h2>
          </div>

          <p className="text-xs text-[#736154]">
            Pick a source and target language to test whether translation pipelines, voice recognition (STT), and neural voice synthesis (TTS) can link successfully.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
            {/* Source */}
            <div className="sm:col-span-2">
              <label htmlFor="pair-checker-source" className="block text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] mb-1.5">
                Source Language (Speaker)
              </label>
              <select
                id="pair-checker-source"
                aria-label="Source Language (Speaker)"
                value={checkSource}
                onChange={(e) => setCheckSource(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-sm text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] transition-all cursor-pointer"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Arrow Divider */}
            <div className="flex justify-center sm:pt-6">
              <div className="w-9 h-9 rounded-full border border-[#ded7cc] bg-[#f7f5f0] flex items-center justify-center text-[#736154]">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Target */}
            <div className="sm:col-span-2">
              <label htmlFor="pair-checker-target" className="block text-xs font-semibold uppercase tracking-wider text-[#5c4a3e] mb-1.5">
                Target Language (Translation)
              </label>
              <select
                id="pair-checker-target"
                aria-label="Target Language (Translation)"
                value={checkTarget}
                onChange={(e) => setCheckTarget(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#ded7cc] bg-[#f7f5f0] text-sm text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] transition-all cursor-pointer"
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
              className={`p-4 rounded-xl border ${
                pairEvaluation.isValid
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                {pairEvaluation.isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="text-emerald-950">
                      Language Pair Supported: {checkSource} ➔ {checkTarget} is Fully Operational
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span className="text-rose-950">
                      Language Pair Unsupported: Capability Requirements Missing
                    </span>
                  </>
                )}
              </div>

              {pairEvaluation.isValid ? (
                <p className="mt-1 text-xs text-emerald-900 ml-6">
                  Speech recognition, neural translation model, and TTS voice synthesis are verified and ready for hardware deployment.
                </p>
              ) : (
                <ul className="mt-2 text-xs text-rose-900 list-disc list-inside ml-6 space-y-1">
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
              <h2 className="text-lg font-bold text-[#2b1d16]">
                Global Language Matrix
              </h2>
              <p className="text-xs text-[#736154]">
                Detailed capability breakdown and neural voice profiles per supported locale
              </p>
            </div>

            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-[#8a776a] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search language name or code..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#ded7cc] bg-white text-xs text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] focus:ring-1 focus:ring-[#e9b140] shadow-sm transition-all placeholder:text-[#8a776a]"
              />
            </div>
          </div>

          <div className="bg-white border border-[#ded7cc] rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#ded7cc] bg-[#f7f5f0] text-[11px] font-semibold uppercase tracking-wider text-[#736154]">
                    <th className="py-3.5 px-5">Language & Code</th>
                    <th className="py-3.5 px-4 text-center">Speech Recognition (STT)</th>
                    <th className="py-3.5 px-4 text-center">Auto-Detect (Lang ID)</th>
                    <th className="py-3.5 px-4 text-center">Machine Translate</th>
                    <th className="py-3.5 px-4 text-center">Neural TTS</th>
                    <th className="py-3.5 px-5">Available Voices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ded7cc] text-xs">
                  {filteredLanguages.map((lang) => (
                    <tr key={lang.code} className="hover:bg-[#f7f5f0] transition-colors">
                      {/* Name & Code */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-[#2b1d16] text-sm">
                            {lang.name}
                          </span>
                          <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16]">
                            {lang.code}
                          </span>
                        </div>
                      </td>

                      {/* STT */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.stt || lang.capabilities.stt_streaming || lang.capabilities.stt_batch ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[#8a776a]">
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </td>

                      {/* Lang ID */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.stt || lang.capabilities.stt_language_id ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[#8a776a]">
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </td>

                      {/* Translate */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.translate ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[#8a776a]">
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </td>

                      {/* TTS */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.tts || lang.capabilities.tts_neural ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[#8a776a]">
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </td>

                      {/* Voices list */}
                      <td className="py-3.5 px-5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lang.voices.map((v) => (
                            <span
                              key={v.id}
                              className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16]"
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
