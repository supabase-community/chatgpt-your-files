import { Pipeline, pipeline } from '@xenova/transformers';
import { PipeParameters, PipeReturnType } from '../hooks/use-pipeline';

export type InitEventData = {
  type: 'init';
  args: Parameters<typeof pipeline>;
};

export type RunEventData = {
  type: 'run';
  id: number;
  args: PipeParameters;
};

export type IncomingEventData = InitEventData | RunEventData;

type BaseProgressUpdate = {
  name: string;
  file: string;
};

export type InitiateProgressUpdate = BaseProgressUpdate & {
  status: 'initiate';
};

export type DownloadProgressUpdate = BaseProgressUpdate & {
  status: 'download';
};

export type ProgressProgressUpdate = BaseProgressUpdate & {
  status: 'progress';
  progress: number;
  loaded: number;
  total: number;
};

export type DoneProgressUpdate = BaseProgressUpdate & {
  status: 'done';
};

export type ProgressUpdate =
  | InitiateProgressUpdate
  | DownloadProgressUpdate
  | ProgressProgressUpdate
  | DoneProgressUpdate;

export type ProgressEventData = {
  type: 'progress';
  data: ProgressUpdate;
};

export type ReadyEventData = {
  type: 'ready';
};

export type ResultEventData = {
  type: 'result';
  id: number;
  data: PipeReturnType;
};

export type OutgoingEventData =
  | ProgressEventData
  | ReadyEventData
  | ResultEventData;

class PipelineSingleton {
  static instance?: Pipeline;

  static async init(...args: Parameters<typeof pipeline>) {
    this.instance = await pipeline(...args);
  }
}

// Listen for messages from the main thread
self.addEventListener(
  'message',
  async (event: MessageEvent<IncomingEventData>) => {
    const { type, args } = event.data;

    switch (type) {
      case 'init': {
        const progress_callback = (data: ProgressUpdate) => {
          self.postMessage({
            type: 'progress',
            data,
          } satisfies ProgressEventData);
        };

        const [task, model, options] = args;

        await PipelineSingleton.init(task, model, {
          ...options,
          progress_callback,
        });

        self.postMessage({
          type: 'ready',
        } satisfies ReadyEventData);

        break;
      }
      case 'run': {
        if (!PipelineSingleton.instance) {
          throw new Error('Pipeline not initialized');
        }

        const { id } = event.data;

        const output = await PipelineSingleton.instance(...args);

        // Classes (ie. `Tensor`) cannot be transferred to the main thread,
        // so we spread its properties into a plain object
        const data = { ...output };

        self.postMessage({
          type: 'result',
          id,
          data,
        } satisfies ResultEventData);

        break;
      }
    }
  }
);
