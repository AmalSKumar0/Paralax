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
              <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dialogue text or conversation ID..."
                className="w-full pl-10 pr-4 py-2 rounded-full border-[2px] border-black bg-white font-bold text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc86b] shadow-[2px_2px_0px_#000]"
              />
            </div>

            {/* Device Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="device-filter-select" className="text-xs font-black uppercase text-gray-700 hidden sm:inline">
                Device:
              </label>
              <select
                id="device-filter-select"
                aria-label="Filter conversations by device"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="px-3 py-2 rounded-full border-[2px] border-black bg-[#f0ece1] font-bold text-xs focus:bg-white focus:outline-none shadow-[2px_2px_0px_#000]"
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

          <span className="text-xs font-mono font-bold text-gray-600">
            {conversations.length} sessions logged
          </span>
        </div>

        {/* Conversations Grid / List */}
        {isLoading ? (
          <div className="py-16 text-center text-gray-500 font-bold">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
              <span>Loading conversations...</span>
            </div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center border-[3px] border-dashed border-black rounded-[2rem] bg-white">
            <MessagesSquare className="w-10 h-10 mx-auto text-gray-400 mb-2" />
            <h3 className="font-display text-2xl font-black text-gray-800">No Conversations Found</h3>
            <p className="text-xs font-semibold text-gray-600 max-w-sm mx-auto mt-1">
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
                  className="p-5 rounded-[1.75rem] border-[3px] border-black bg-white shadow-[4px_4px_0px_0px_#000] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#ffc86b] transition-all cursor-pointer group"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b-[2px] border-black/15 gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl border-[2px] border-black bg-[#ffc86b] flex items-center justify-center shrink-0">
                        <MessagesSquare className="w-4 h-4 text-black" />
                      </div>
                      <div>
                        <span className="font-black text-sm text-[#1a1a1a]">
                          {conv.conversation_id}
                        </span>
                        <span className="text-xs font-bold text-gray-500 ml-2">
                          · {devName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border border-black bg-[#f0ece1]">
                        {turnsCount} {turnsCount === 1 ? 'Turn' : 'Turns'}
                      </span>
                      <span className="text-xs font-mono font-bold text-gray-600">
                        {formatDateTime(conv.updated_at)}
                      </span>
                    </div>
                  </div>

                  {/* Latest dialogue preview */}
                  {lastTurn && (
                    <div className="mt-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded-xl border border-black/20 bg-[#f9f6f0]">
                        <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                          Original ({lastTurn.source_language}):
                        </span>
                        <p className="font-semibold text-gray-800 line-clamp-2">
                          "{lastTurn.transcript || 'Audio utterance'}"
                        </p>
                      </div>

                      <div className="p-2.5 rounded-xl border border-black/20 bg-[#fffdf8]">
                        <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                          Translated ({lastTurn.target_language}):
                        </span>
                        <p className="font-semibold text-gray-800 line-clamp-2">
                          "{lastTurn.translation || 'Processing translation...'}"
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end text-xs font-black text-black group-hover:translate-x-1 transition-transform">
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
