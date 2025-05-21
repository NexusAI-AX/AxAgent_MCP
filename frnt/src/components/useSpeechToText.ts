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

  const speechRecognitionCtor =
    typeof window === 'undefined'
      ? undefined
      : window.SpeechRecognition || window.webkitSpeechRecognition;

  const supported = !!speechRecognitionCtor;

  const start = useCallback(() => {
    if (!supported || listening || !speechRecognitionCtor) return;
    const recognition = new speechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.interimResults = false;
      recognition.onresult = (e: SpeechRecognitionEvent) => {
        const transcript = Array.from(e.results as any[])
          .map((r: any) => r[0].transcript)
          .join('');
      onResult(transcript);
    };
    recognition.onend = () => {
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
    };
    recognition.start();
    setListening(true);
  }, [supported, listening, onResult, speechRecognitionCtor]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { start, stop, listening, supported };
}
