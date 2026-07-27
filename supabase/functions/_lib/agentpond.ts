import { SpanStatusCode, trace, type Span } from 'npm:@opentelemetry/api@1.9.0';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
} from 'npm:@opentelemetry/sdk-trace-base@2.9.0';
import { createSupabaseSpanExporter } from 'npm:@agentpond/supabase@0.6.0';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const enabled = Deno.env.get('AGENTPOND_ENABLED') === 'true';
const capture = {
  recordInputs: true,
  recordOutputs: true,
} as const;

let processor: BatchSpanProcessor | undefined;

if (enabled) {
  const exporter = createSupabaseSpanExporter();
  processor = new BatchSpanProcessor(exporter);
  const provider = new BasicTracerProvider({
    spanProcessors: [processor],
  });
  trace.setGlobalTracerProvider(provider);
}

export function startOpenAISpan(
  messages: unknown,
  model: string
): Span | undefined {
  if (!enabled) return;

  return trace.getTracer('chatgpt-your-files').startSpan('chat.completion', {
    attributes: {
      'openinference.span.kind': 'LLM',
      'llm.model_name': model,
      ...(capture.recordInputs
        ? {
            'input.value': JSON.stringify(messages),
            'input.mime_type': 'application/json',
          }
        : {}),
    },
  });
}

export function finishOpenAISpan(
  span: Span | undefined,
  output?: string,
  error?: unknown
) {
  if (!span) return;

  if (output !== undefined && capture.recordOutputs) {
    span.setAttributes({
      'output.value': output,
      'output.mime_type': 'text/plain',
    });
  }
  if (error !== undefined) {
    const exception = error instanceof Error ? error : new Error(String(error));
    span.recordException(exception);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: exception.message,
    });
  }
  span.end();

  if (processor) {
    EdgeRuntime.waitUntil(
      processor.forceFlush().catch((flushError) => {
        console.error('Failed to flush AgentPond traces', flushError);
      })
    );
  }
}
