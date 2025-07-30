export function formatDistanceToNow(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + ' minutes ago';
  if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + ' hours ago';
  if (diffInSeconds < 604800) return Math.floor(diffInSeconds / 86400) + ' days ago';
  return d.toLocaleDateString();
}
