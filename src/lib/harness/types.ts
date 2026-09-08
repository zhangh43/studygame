export type HarnessEvent =
  | { type: "session"; sessionId: string }
  | { type: "activity"; message: string }
  | { type: "files"; paths: string[] }
  | { type: "assistant"; message: string }
  | { type: "done" };

export type HarnessRequest = {
  workspace: string;
  sessionId?: string | null;
  message: string;
  signal?: AbortSignal;
  traceId?: string;
};

export interface GameHarness {
  run(request: HarnessRequest): AsyncGenerator<HarnessEvent>;
}
