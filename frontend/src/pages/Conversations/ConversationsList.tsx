import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import { Conversation, Device } from '../../types';
import { Topbar } from '../../components/Layout/Topbar';
import { Card } from '../../components/Common/Card';
import { Badge } from '../../components/Common/Badge';
import { formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { Search, MessagesSquare, ChevronRight, RefreshCw, Filter, Calendar } from 'lucide-react';

export const ConversationsList: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const [convData, devList] = await Promise.all([
        api.getConversations({
          device_id: selectedDeviceId !== 'all' ? selectedDeviceId : undefined,
          search: searchQuery || undefined,
        }),
        api.getDevices(),
      ]);
      setConversations(convData.items);
      setDevices(devList);
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDeviceId, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex-1 flex flex-col pb-12">
      <Topbar
        title="Conversations"
        subtitle="Multi-turn speech translation sessions recorded across IoT devices"
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
        {/* Filter Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-[260px] sm:min-w-[320px]">
              <Search className="w-4 h-4 text-[#8a776a] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dialogue text or conversation ID..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#ded7cc] bg-white text-xs text-[#2b1d16] focus:bg-white focus:outline-none focus:border-[#e9b140] focus:ring-1 focus:ring-[#e9b140] shadow-sm transition-all placeholder:text-[#8a776a]"
              />
            </div>

            {/* Device Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="device-filter-select" className="text-xs font-medium text-[#736154] hidden sm:inline">
                Device:
              </label>
              <select
                id="device-filter-select"
                aria-label="Filter conversations by device"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-[#ded7cc] bg-white text-xs font-medium text-[#2b1d16] focus:outline-none focus:border-[#e9b140] shadow-sm cursor-pointer"
              >
                <option value="all">All Translator Devices</option>
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.name} ({d.device_id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className="text-xs font-mono text-[#736154]">
            {conversations.length} sessions logged
          </span>
        </div>

        {/* Conversations Grid / List */}
        {isLoading ? (
          <div className="py-16 text-center text-[#736154]">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#736154]" />
              <span>Loading conversations...</span>
            </div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#ded7cc] rounded-2xl bg-white">
            <MessagesSquare className="w-8 h-8 mx-auto text-[#8a776a] mb-2" />
            <h3 className="text-lg font-bold text-[#2b1d16]">No Conversations Found</h3>
            <p className="text-xs text-[#736154] max-w-sm mx-auto mt-1">
              No sessions match the current query. Utterances from connected translator devices or the Test Console will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {conversations.map((conv) => {
              const turnsCount = conv.turns.length;
              const lastTurn = conv.turns[turnsCount - 1];
              const devName = devices.find((d) => d.device_id === conv.device_id)?.name || conv.device_id;

              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => navigate(`/conversations/${conv.conversation_id}`)}
                  className="p-5 rounded-2xl border border-[#ded7cc] bg-white shadow-sm hover:border-[#e9b140] transition-all cursor-pointer group"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-[#ded7cc] gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg border border-[#ded7cc] bg-[#f7f5f0] flex items-center justify-center shrink-0">
                        <MessagesSquare className="w-4 h-4 text-[#e9b140]" />
                      </div>
                      <div>
                        <span className="font-semibold text-sm text-[#2b1d16]">
                          {conv.conversation_id}
                        </span>
                        <span className="text-xs text-[#736154] ml-2">
                          · {devName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full border border-[#ded7cc] bg-[#f7f5f0] text-[#2b1d16]">
                        {turnsCount} {turnsCount === 1 ? 'Turn' : 'Turns'}
                      </span>
                      <span className="text-xs font-mono text-[#8a776a]">
                        {formatDateTime(conv.updated_at)}
                      </span>
                    </div>
                  </div>

                  {/* Latest dialogue preview */}
                  {lastTurn && (
                    <div className="mt-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl border border-[#ded7cc] bg-[#f7f5f0]">
                        <span className="text-[10px] font-semibold uppercase text-[#736154] block mb-1">
                          Original ({lastTurn.source_language}):
                        </span>
                        <p className="font-normal text-[#2b1d16] line-clamp-2">
                          "{lastTurn.transcript || 'Audio utterance'}"
                        </p>
                      </div>

                      <div className="p-3 rounded-xl border border-[#ded7cc] bg-[#fffdf8]">
                        <span className="text-[10px] font-semibold uppercase text-[#736154] block mb-1">
                          Translated ({lastTurn.target_language}):
                        </span>
                        <p className="font-normal text-[#2b1d16] line-clamp-2">
                          "{lastTurn.translation || 'Processing translation...'}"
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end text-xs font-medium text-[#736154] group-hover:text-[#2b1d16] transition-colors">
                    View Full Session Turns <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
