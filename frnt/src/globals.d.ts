// Minimal speech recognition interfaces

export {};

declare global {
  interface SpeechRecognition {
    interimResults: boolean;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onend: (() => any) | null;
    onerror: (() => any) | null;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList extends Array<SpeechRecognitionResult> {}

  interface SpeechRecognitionResult extends Array<SpeechRecognitionAlternative> {}

  interface SpeechRecognitionAlternative {
    transcript: string;
  }

  interface Window {
    webkitSpeechRecognition?: { new (): SpeechRecognition };
    SpeechRecognition?: { new (): SpeechRecognition };
  }
}
