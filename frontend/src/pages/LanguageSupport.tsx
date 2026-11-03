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
          <div className="flex items-center gap-2 pb-4 border-b-2 border-[#121212]">
            <Sparkles className="w-5 h-5 text-[#121212]" />
            <h2 className="text-lg font-bold text-[#121212]">
              Language Pair Verification Tool
            </h2>
          </div>

          <p className="text-xs text-[#555555]">
            Pick a source and target language to test whether translation pipelines, voice recognition (STT), and neural voice synthesis (TTS) can link successfully.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
            {/* Source */}
            <div className="sm:col-span-2">
              <label htmlFor="pair-checker-source" className="block text-xs font-bold uppercase tracking-wider text-[#121212] mb-1.5">
                Source Language (Speaker)
              </label>
              <select
                id="pair-checker-source"
                aria-label="Source Language (Speaker)"
                value={checkSource}
                onChange={(e) => setCheckSource(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#121212] bg-[#fffdfa] text-sm font-semibold text-[#121212] focus:bg-white focus:outline-none shadow-[2px_2px_0px_#121212] transition-all cursor-pointer"
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
              <div className="w-10 h-10 rounded-xl border-2 border-[#121212] bg-[#ffc86b] shadow-[2px_2px_0px_#121212] flex items-center justify-center text-[#121212]">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>

            {/* Target */}
            <div className="sm:col-span-2">
              <label htmlFor="pair-checker-target" className="block text-xs font-bold uppercase tracking-wider text-[#121212] mb-1.5">
                Target Language (Translation)
              </label>
              <select
                id="pair-checker-target"
                aria-label="Target Language (Translation)"
                value={checkTarget}
                onChange={(e) => setCheckTarget(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#121212] bg-[#fffdfa] text-sm font-semibold text-[#121212] focus:bg-white focus:outline-none shadow-[2px_2px_0px_#121212] transition-all cursor-pointer"
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
              className={`p-4 rounded-xl border-2 border-[#121212] shadow-[2.5px_2.5px_0px_#121212] ${
                pairEvaluation.isValid
                  ? 'bg-[#bbf7d0]'
                  : 'bg-[#fecdd3]'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm text-[#121212]">
                {pairEvaluation.isValid ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-[#121212] shrink-0" />
                    <span>
                      Language Pair Supported: {checkSource} ➔ {checkTarget} is Fully Operational
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-[#121212] shrink-0" />
                    <span>
                      Language Pair Unsupported: Capability Requirements Missing
                    </span>
                  </>
                )}
              </div>

              {pairEvaluation.isValid ? (
                <p className="mt-1 text-xs font-medium text-[#121212] ml-7">
                  Speech recognition, neural translation model, and TTS voice synthesis are verified and ready for hardware deployment.
                </p>
              ) : (
                <ul className="mt-2 text-xs font-semibold text-[#121212] list-disc list-inside ml-7 space-y-1">
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
              <h2 className="text-lg font-bold text-[#121212]">
                Global Language Matrix
              </h2>
              <p className="text-xs text-[#555555]">
                Detailed capability breakdown and neural voice profiles per supported locale
              </p>
            </div>

            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-[#121212] absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search language name or code..."
                className="w-full pl-10 pr-3.5 py-2 rounded-xl border-2 border-[#121212] bg-white text-xs font-semibold text-[#121212] focus:bg-white focus:outline-none shadow-[2.5px_2.5px_0px_#121212] transition-all placeholder:text-[#666666]"
              />
            </div>
          </div>

          <div className="bg-white border-2 border-[#121212] rounded-xl shadow-[4px_4px_0px_#121212] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#121212] bg-[#f8f6f0] text-[11px] font-bold uppercase tracking-wider text-[#121212]">
                    <th className="py-3.5 px-5">Language & Code</th>
                    <th className="py-3.5 px-4 text-center">Speech Recognition (STT)</th>
                    <th className="py-3.5 px-4 text-center">Auto-Detect (Lang ID)</th>
                    <th className="py-3.5 px-4 text-center">Machine Translate</th>
                    <th className="py-3.5 px-4 text-center">Neural TTS</th>
                    <th className="py-3.5 px-5">Available Voices</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#121212] text-xs">
                  {filteredLanguages.map((lang) => (
                    <tr key={lang.code} className="hover:bg-[#fff9eb] transition-colors">
                      {/* Name & Code */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-[#121212] text-sm">
                            {lang.name}
                          </span>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border-2 border-[#121212] bg-white shadow-[1px_1px_0px_#121212] text-[#121212]">
                            {lang.code}
                          </span>
                        </div>
                      </td>

                      {/* STT */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.stt || lang.capabilities.stt_streaming || lang.capabilities.stt_batch ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#bbf7d0] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#fecdd3] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <X className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </td>

                      {/* Lang ID */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.stt || lang.capabilities.stt_language_id ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#bbf7d0] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#fecdd3] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <X className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </td>

                      {/* Translate */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.translate ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#bbf7d0] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#fecdd3] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <X className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </td>

                      {/* TTS */}
                      <td className="py-3.5 px-4 text-center">
                        {lang.capabilities.tts || lang.capabilities.tts_neural ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#bbf7d0] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-[#121212] bg-[#fecdd3] text-[#121212] shadow-[1px_1px_0px_#121212]">
                            <X className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </td>

                      {/* Voices list */}
                      <td className="py-3.5 px-5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lang.voices.map((v) => (
                            <span
                              key={v.id}
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-md border-2 border-[#121212] bg-white shadow-[1px_1px_0px_#121212] text-[#121212]"
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
