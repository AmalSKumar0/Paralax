import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import { ApiJob, Device, JobStatus, JobKind } from '../../types';
import { Topbar } from '../../components/Layout/Topbar';
import { Button } from '../../components/Common/Button';
import { Badge } from '../../components/Common/Badge';
import { ConfirmModal } from '../../components/Common/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { formatRelativeTime, formatDuration, formatLatency } from '../../utils/formatters';
import {
  Search,
  Filter,
  RefreshCw,
  RotateCcw,
  Ban,
  Trash2,
  ChevronRight,
  Activity,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  Mic,
  Clock,
} from 'lucide-react';

export const JobsList: React.FC = () => {
  const { onToggleMobileNav } = useOutletContext<{ onToggleMobileNav?: () => void }>() || {};
  const navigate = useNavigate();
  const { success, error, warning } = useToast();

  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk selection
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete_single' | 'retry_single' | 'bulk_delete' | 'bulk_retry';
    jobId?: string;
    title: string;
    message: string;
  }>({ isOpen: false, type: 'delete_single', title: '', message: '' });

  const fetchJobs = useCallback(
    async (isManual: boolean = false) => {
      if (isManual) setIsRefreshing(true);
      try {
        const [jobsData, devData] = await Promise.all([
          api.getJobs({
            status: statusFilter !== 'all' ? statusFilter : undefined,
            kind: kindFilter !== 'all' ? kindFilter : undefined,
            device_id: deviceFilter !== 'all' ? deviceFilter : undefined,
          }),
          api.getDevices(),
        ]);
        setJobs(jobsData.items);
        setDevices(devData);
      } catch (err) {
        console.error('Failed to load jobs', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [statusFilter, kindFilter, deviceFilter]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Live polling for non-final jobs (queued, transcribing, translating, synthesizing)
  useEffect(() => {
    const hasNonFinalJobs = jobs.some(
      (j) => j.status === 'queued' || j.status === 'stt' || j.status === 'translating' || j.status === 'synthesizing'
    );

    if (hasNonFinalJobs) {
      const interval = setInterval(() => {
        fetchJobs();
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [jobs, fetchJobs]);

  // Search filtering
  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      j.job_id.toLowerCase().includes(q) ||
      j.device_id?.toLowerCase().includes(q) ||
      j.filename?.toLowerCase().includes(q) ||
      j.source_language.toLowerCase().includes(q) ||
      j.target_language.toLowerCase().includes(q)
    );
  });

  // Bulk Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedJobIds.size === filteredJobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(filteredJobs.map((j) => j.job_id)));
    }
  };

  const handleToggleSelectJob = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedJobIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedJobIds(next);
  };

  // Actions
  const handleExecuteAction = async () => {
    const { type, jobId } = confirmModal;
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

    try {
      if (type === 'delete_single' && jobId) {
        await api.deleteJob(jobId);
        setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
        selectedJobIds.delete(jobId);
        success(`Job ${jobId} deleted`);
      } else if (type === 'retry_single' && jobId) {
        const retried = await api.retryJob(jobId);
        setJobs((prev) => prev.map((j) => (j.job_id === jobId ? retried : j)));
        success(`Job ${jobId} queued for retry`);
      } else if (type === 'bulk_delete') {
        const ids = Array.from(selectedJobIds);
        await Promise.all(ids.map((id) => api.deleteJob(id)));
        setJobs((prev) => prev.filter((j) => !selectedJobIds.has(j.job_id)));
        setSelectedJobIds(new Set());
        success(`Deleted ${ids.length} jobs`);
      } else if (type === 'bulk_retry') {
        const ids = Array.from(selectedJobIds);
        await Promise.all(ids.map((id) => api.retryJob(id)));
        setSelectedJobIds(new Set());
        fetchJobs();
        success(`Retried ${ids.length} jobs`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      error(msg);
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" size="sm" dot>Completed</Badge>;
      case 'failed':
        return <Badge variant="danger" size="sm" dot>Failed</Badge>;
      case 'cancelled':
        return <Badge variant="neutral" size="sm">Cancelled</Badge>;
      case 'stt':
      case 'translating':
      case 'synthesizing':
        return <Badge variant="warning" size="sm" dot className="animate-pulse">{status}</Badge>;
      case 'queued':
      default:
        return <Badge variant="info" size="sm">Queued</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-16">
      <Topbar
        title="Processing Jobs"
        subtitle="Live audio translation pipeline tasks, batch files & execution history"
        onRefresh={() => fetchJobs(true)}
        isRefreshing={isRefreshing}
        onToggleMobileNav={onToggleMobileNav}
      />

      <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
        {/* Filter & Search Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search job ID, filename, device..."
                className="w-full pl-10 pr-4 py-2 rounded-full border-[2px] border-black bg-white font-bold text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ffc86b] shadow-[2px_2px_0px_#000]"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="job-status-filter-select" className="text-xs font-black uppercase text-gray-700 hidden sm:inline">
                Status:
              </label>
              <select
                id="job-status-filter-select"
                aria-label="Filter jobs by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-full border-[2px] border-black bg-[#f0ece1] font-bold text-xs focus:bg-white focus:outline-none shadow-[2px_2px_0px_#000]"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="transcribing">Transcribing</option>
                <option value="translating">Translating</option>
                <option value="synthesizing">Synthesizing</option>
                <option value="queued">Queued</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Kind Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="job-kind-filter-select" className="text-xs font-black uppercase text-gray-700 hidden sm:inline">
                Kind:
              </label>
              <select
                id="job-kind-filter-select"
                aria-label="Filter jobs by kind"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="px-3 py-2 rounded-full border-[2px] border-black bg-[#f0ece1] font-bold text-xs focus:bg-white focus:outline-none shadow-[2px_2px_0px_#000]"
              >
                <option value="all">All Kinds</option>
                <option value="utterance">Live Utterance</option>
                <option value="file">Batch File Job</option>
              </select>
            </div>

            {/* Device Filter */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="job-device-filter-select" className="text-xs font-black uppercase text-gray-700 hidden sm:inline">
                Device:
              </label>
              <select
                id="job-device-filter-select"
                aria-label="Filter jobs by device"
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
                className="px-3 py-2 rounded-full border-[2px] border-black bg-[#f0ece1] font-bold text-xs focus:bg-white focus:outline-none shadow-[2px_2px_0px_#000]"
              >
                <option value="all">All Devices</option>
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk Actions Bar if items selected */}
          {selectedJobIds.size > 0 && (
            <div className="flex items-center gap-2 p-1.5 rounded-full border-[2px] border-black bg-[#ffc86b] shadow-[3px_3px_0px_#000] animate-in fade-in">
              <span className="text-xs font-black px-2.5">
                {selectedJobIds.size} Selected
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    type: 'bulk_retry',
                    title: `Retry ${selectedJobIds.size} Jobs?`,
                    message: `This will re-queue all ${selectedJobIds.size} selected jobs into the cloud speech processing pipeline.`,
                  })
                }
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Retry
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  setConfirmModal({
                    isOpen: true,
                    type: 'bulk_delete',
                    title: `Delete ${selectedJobIds.size} Jobs?`,
                    message: `Are you sure you want to permanently delete ${selectedJobIds.size} jobs and their stored audio records?`,
                  })
                }
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Jobs Table */}
        <div className="bg-white border-[3px] border-black rounded-[2rem] shadow-[6px_6px_0px_0px_#000] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-[3px] border-black bg-[#f9f6f0] text-[11px] font-black uppercase tracking-wider text-black">
                  <th className="py-3.5 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={filteredJobs.length > 0 && selectedJobIds.size === filteredJobs.length}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded border-2 border-black accent-black cursor-pointer"
                      aria-label="Select all jobs"
                    />
                  </th>
                  <th className="py-3.5 px-4">Job ID</th>
                  <th className="py-3.5 px-4">Kind</th>
                  <th className="py-3.5 px-4">Device / File</th>
                  <th className="py-3.5 px-4">Language Pair</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Latency</th>
                  <th className="py-3.5 px-4">Created</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-[2px] divide-black/10 text-xs font-semibold">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500 font-bold">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        <span>Loading job queue...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500 font-bold">
                      No matching translation jobs found.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => {
                    const isSelected = selectedJobIds.has(job.job_id);
                    const isFailed = job.status === 'failed';
                    const isInProgress =
                      job.status === 'queued' ||
                      job.status === 'stt' ||
                      job.status === 'translating' ||
                      job.status === 'synthesizing';

                    return (
                      <tr
                        key={job.job_id}
                        onClick={() => navigate(`/jobs/${job.job_id}`)}
                        className={`hover:bg-[#ffc86b]/15 transition-colors cursor-pointer group ${
                          isSelected ? 'bg-[#ffc86b]/20' : ''
                        }`}
                      >
                        {/* Select checkbox */}
                        <td className="py-4 px-4" onClick={(e) => handleToggleSelectJob(job.job_id, e)}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-2 border-black accent-black cursor-pointer"
                            aria-label={`Select job ${job.job_id}`}
                          />
                        </td>

                        {/* ID */}
                        <td className="py-4 px-4 font-mono font-black text-black">
                          {job.job_id}
                        </td>

                        {/* Kind */}
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-black text-[11px] font-black uppercase bg-[#f0ece1]">
                            {job.kind === 'utterance' ? (
                              <>
                                <Mic className="w-3 h-3 text-black" />
                                Utterance
                              </>
                            ) : (
                              <>
                                <FileAudio className="w-3 h-3 text-black" />
                                File Job
                              </>
                            )}
                          </span>
                        </td>

                        {/* Device / Filename */}
                        <td className="py-4 px-4">
                          {job.device_id ? (
                            <span className="font-bold text-gray-800">
                              {job.device_id}
                            </span>
                          ) : (
                            <span className="font-mono text-gray-700 truncate max-w-[150px] inline-block">
                              {job.filename || 'Direct upload'}
                            </span>
                          )}
                        </td>

                        {/* Language Pair */}
                        <td className="py-4 px-4">
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-black bg-[#f9f6f0] font-black text-[11px]">
                            <span>{job.source_language}</span>
                            <span className="text-gray-400">➔</span>
                            <span>{job.target_language}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4">
                          {getStatusBadge(job.status)}
                        </td>

                        {/* Total Latency */}
                        <td className="py-4 px-4 font-mono font-bold text-gray-700">
                          {job.timings ? formatLatency(job.timings.total_ms) : '-'}
                        </td>

                        {/* Created */}
                        <td className="py-4 px-4 font-medium text-gray-600">
                          {formatRelativeTime(job.created_at)}
                        </td>

                        {/* Row Actions */}
                        <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {(job.can_retry || job.canRetry) && (
                              <button
                                onClick={() =>
                                  setConfirmModal({
                                    isOpen: true,
                                    type: 'retry_single',
                                    jobId: job.job_id || job.jobId,
                                    title: `Retry Job ${job.job_id || job.jobId}?`,
                                    message: 'Re-trigger translation and voice synthesis for this audio recording.',
                                  })
                                }
                                className="p-1.5 rounded-lg border border-black bg-white hover:bg-[#ffc86b] cursor-pointer"
                                title="Retry job"
                                aria-label="Retry job"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-black" />
                              </button>
                            )}

                            <button
                              onClick={() =>
                                setConfirmModal({
                                  isOpen: true,
                                  type: 'delete_single',
                                  jobId: job.job_id,
                                  title: `Delete Job ${job.job_id}?`,
                                  message: 'Permanently remove this job and its audio transcripts.',
                                })
                              }
                              className="p-1.5 rounded-lg border border-black bg-white hover:bg-[#ffecec] text-rose-700 cursor-pointer"
                              title="Delete job"
                              aria-label="Delete job"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => navigate(`/jobs/${job.job_id}`)}
                              className="p-1.5 rounded-lg border border-black bg-[#f0ece1] hover:bg-black hover:text-white cursor-pointer ml-1"
                              title="View details"
                              aria-label="View job detail"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleExecuteAction}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Confirm"
        variant={confirmModal.type.includes('delete') ? 'danger' : 'primary'}
      />
    </div>
  );
};
