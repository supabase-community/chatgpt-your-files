import { Pipeline, PretrainedOptions, Tensor } from '@xenova/transformers';
import { useEffect, useState } from 'react';
import {
  InitEventData,
  OutgoingEventData,
  RunEventData,
} from '../workers/pipeline';

export type PipeParameters = Parameters<Pipeline['_call']>;
export type PipeReturnType = Awaited<ReturnType<Pipeline['_call']>>;
export type PipeFunction = (...args: PipeParameters) => Promise<PipeReturnType>;

/**
 * Hook to build a Transformers.js pipeline function.
 *
 * Similar to `pipeline()`, but runs inference in a separate
 * Web Worker thread and asynchronous logic is
 * abstracted for you.
 *
 * *Important:* `options` must be memoized (if passed),
 * otherwise the hook will continuously rebuild the pipeline.
 */
export function usePipeline(
  task: string,
  model?: string,
  options?: PretrainedOptions
) {
  const [worker, setWorker] = useState<Worker>();
  const [pipe, setPipe] = useState<PipeFunction>();

  // Using `useEffect` + `useState` over `useMemo` because we need a
  // cleanup function and asynchronous initialization
  useEffect(() => {
    const { progress_callback, ...transferableOptions } = options ?? {};

    const worker = new Worker(
      new URL('../workers/pipeline.ts', import.meta.url),
      {
        type: 'module',
      }
    );

    const onMessageReceived = (e: MessageEvent<OutgoingEventData>) => {
      const { type } = e.data;

      switch (type) {
        case 'progress': {
          const { data } = e.data;
          progress_callback?.(data);
          break;
        }
        case 'ready': {
          setWorker(worker);
          break;
        }
      }
    };

    worker.addEventListener('message', onMessageReceived);

    worker.postMessage({
      type: 'init',
      args: [task, model, transferableOptions],
    } satisfies InitEventData);

    return () => {
      worker.removeEventListener('message', onMessageReceived);
      worker.terminate();

      setWorker(undefined);
    };
  }, [task, model, options]);

  // Using `useEffect` + `useState` over `useMemo` because we need a
  // cleanup function
  useEffect(() => {
    if (!worker) {
      return;
    }

    // ID to sync return values between multiple ongoing pipe executions
    let currentId = 0;

    const callbacks = new Map<number, (data: PipeReturnType) => void>();

    const onMessageReceived = (e: MessageEvent<OutgoingEventData>) => {
      switch (e.data.type) {
        case 'result':
          const { id, data: serializedData } = e.data;
          const { type, data, dims } = serializedData;
          const output = new Tensor(type, data, dims);
          const callback = callbacks.get(id);

          if (!callback) {
            throw new Error(`Missing callback for pipe execution id: ${id}`);
          }

          callback(output);
          break;
      }
    };

    worker.addEventListener('message', onMessageReceived);

    const pipe: PipeFunction = (...args) => {
      if (!worker) {
        throw new Error('Worker unavailable');
      }

      const id = currentId++;

      return new Promise<PipeReturnType>((resolve) => {
        callbacks.set(id, resolve);
        worker.postMessage({ type: 'run', id, args } satisfies RunEventData);
      });
    };

    setPipe(() => pipe);

    return () => {
      worker?.removeEventListener('message', onMessageReceived);
      setPipe(undefined);
    };
  }, [worker]);

  return pipe;
}
