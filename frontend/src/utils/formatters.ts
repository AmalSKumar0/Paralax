export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '0.0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}m ${secs}s`;
}

export function formatLatency(ms?: number): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSec < 5) return 'just now';
  if (diffInSec < 60) return `${diffInSec}s ago`;
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m ago`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

export function formatDateTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return dateString;
  }
}

export function getRssiQuality(rssi: number): { label: string; color: string; bars: number } {
  if (rssi >= -65) return { label: 'Excellent', color: 'text-emerald-700 bg-emerald-100 border-emerald-500', bars: 4 };
  if (rssi >= -75) return { label: 'Good', color: 'text-amber-800 bg-amber-100 border-amber-500', bars: 3 };
  if (rssi >= -85) return { label: 'Fair', color: 'text-orange-800 bg-orange-100 border-orange-500', bars: 2 };
  return { label: 'Poor', color: 'text-rose-800 bg-rose-100 border-rose-500', bars: 1 };
}
