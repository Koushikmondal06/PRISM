import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
  (window as any).global = window;
}
