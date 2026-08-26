import { useEffect, useRef } from 'react';

interface BarcodeListenerProps {
  onScan: (barcode: string) => void;
}

/**
 * Global Keyboard Interceptor for USB HID Barcode Scanners.
 * Listens for keypress sequences with inter-character delays < 25ms terminating with Enter.
 * No manual DOM focus required.
 */
export const BarcodeListener: React.FC<BarcodeListenerProps> = ({ onScan }) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Ignore if a popup modal is currently open
      if (document.querySelector('.fixed.z-50')) {
        return;
      }

      // Ignore standard modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        return;
      }

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          onScan(bufferRef.current.trim());
        }
        bufferRef.current = '';
        return;
      }

      // If character arrives fast (< 30ms interval), append to barcode buffer
      if (timeDiff <= 30 || bufferRef.current.length === 0) {
        if (e.key.length === 1) {
          bufferRef.current += e.key;
        }
      } else {
        // Discard slow typing (manual user input)
        bufferRef.current = e.key.length === 1 ? e.key : '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);

  return null;
};
