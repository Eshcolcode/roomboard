export type Tab = 'board' | 'rooms' | 'free' | 'today' | 'changeovers' | 'workers' | 'available' | 'activity' | 'more';

const PATHS: Record<string, string> = {
  board: 'M3 5h18M3 12h18M3 19h18M8 3v18',
  rooms: 'M3 21V7l9-4 9 4v14M9 21v-6h6v6M8 10h2M14 10h2',
  free: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M8 11h6M11 8v6',
  today: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  workers: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 100-6M22 21c0-3-2-5-5-5',
  changeovers: 'M14 4l6 6M4 20c3 0 5-1 6-3l7-7-4-4-7 7c-2 1-3 3-2 7z',
  available: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-5M12 8h.01',
  close: 'M6 6l12 12M18 6L6 18',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const BrushIcon = () => <Icon name="changeovers" size={12} />;
