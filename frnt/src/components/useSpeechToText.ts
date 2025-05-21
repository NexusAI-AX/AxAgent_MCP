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
  const speechRecognitionCtor: (new () => SpeechRecognition) | undefined =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;
  const supported = !!speechRecognitionCtor;

  const start = useCallback(() => {
    if (!speechRecognitionCtor || listening) return;
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
  }, [speechRecognitionCtor, supported, listening, onResult]);

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
