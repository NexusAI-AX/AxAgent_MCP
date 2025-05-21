import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechToTextApi {
  start: () => void;
  stop: () => void;
  listening: boolean;
  supported: boolean;
}

export default function useSpeechToText(
  onResult: (text: string) => void
): SpeechToTextApi {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);

  // Resolve SpeechRecognition constructor across browsers
  const speechRecognitionCtor: typeof SpeechRecognition | undefined =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition || (window as any).webkitSpeechRecognition)
      : undefined;

  const supported = Boolean(speechRecognitionCtor);

  /**
   * Start listening for speech input.
   */
  const start = useCallback(() => {
    if (!speechRecognitionCtor || listening) return;

    const recognition = new speechRecognitionCtor();
    recognitionRef.current = recognition;

    recognition.interimResults = false;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(result => result[0].transcript)
        .join('');
      onResult(transcript);
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.start();
    setListening(true);
  }, [speechRecognitionCtor, listening, onResult]);

  /**
   * Stop listening for speech input.
   */
  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Clean up recorder when hook unmounts.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { start, stop, listening, supported };
}
