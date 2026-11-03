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

export const DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function isDeviceOnline(device?: { online?: boolean; last_seen?: string; status?: string }): boolean {
  if (!device) return false;
  if (device.status === 'revoked') return false;
  if (device.last_seen) {
    return (Date.now() - new Date(device.last_seen).getTime()) <= DEVICE_ONLINE_THRESHOLD_MS;
  }
  return Boolean(device.online);
}

/**
 * Format relative time for offline devices based on (last_seen + 5 min),
 * representing the exact moment the device transitioned to offline.
 */
export function formatOfflineLastSeen(dateString?: string): string {
  if (!dateString) return 'never';
  const lastSeenMs = new Date(dateString).getTime();
  if (isNaN(lastSeenMs)) return 'never';

  // Transition moment when device actually went offline
  const offlineSinceMs = lastSeenMs + DEVICE_ONLINE_THRESHOLD_MS;
  const now = Date.now();
  const diffInSec = Math.floor((now - offlineSinceMs) / 1000);

  if (diffInSec <= 5) return 'just now';
  if (diffInSec < 60) return `${diffInSec}s ago`;
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m ago`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
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
