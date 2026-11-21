// A pipeline failure whose message is safe to log: it names what went wrong,
// never a prompt, a document, a model answer or a secret. Any step may throw
// it; the run then ends flagged with the generic pipeline-error reason.
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineError';
  }
}
