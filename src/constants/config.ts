export const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5];

export const API_BASE =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://bbc-english-api.1140390745.workers.dev';
