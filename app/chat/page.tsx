'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePipeline } from '@/lib/hooks/use-pipeline';
import { cn } from '@/lib/utils';
import { Database } from '@/supabase/functions/_lib/database';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useChat } from 'ai/react';

export default function ChatPage() {
  const supabase = createClientComponentClient<Database>();

  const generateEmbedding = usePipeline(
    'feature-extraction',
    'Supabase/gte-small'
  );

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat`,
    });

  const isReady = !!generateEmbedding;

  return (
    <div className="max-w-6xl flex flex-col items-center w-full h-full">
      <div className="flex flex-col w-full gap-6 grow my-2 sm:my-10 p-4 sm:p-8 sm:border rounded-sm overflow-y-auto">
        <div className="border-slate-400 rounded-lg flex flex-col justify-start gap-4 pr-2 grow overflow-y-scroll">
          {messages.map(({ id, role, content }) => (
            <div
              key={id}
              className={cn(
                'rounded-xl bg-gray-500 text-white px-4 py-2 max-w-lg',
                role === 'user' ? 'self-end bg-blue-600' : 'self-start'
              )}
            >
              {content}
            </div>
          ))}
          {isLoading && (
            <div className="self-start m-6 text-gray-500 before:text-gray-500 after:text-gray-500 dot-pulse" />
          )}
          {messages.length === 0 && (
            <div className="self-stretch flex grow items-center justify-center">
              <svg
                className="opacity-10"
                width="150px"
                height="150px"
                version="1.1"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g>
                  <path d="m77.082 39.582h-29.164c-3.543 0-6.25 2.707-6.25 6.25v16.668c0 3.332 2.707 6.25 6.25 6.25h20.832l8.332 8.332v-8.332c3.543 0 6.25-2.918 6.25-6.25v-16.668c0-3.5391-2.707-6.25-6.25-6.25z" />
                  <path d="m52.082 25h-29.164c-3.543 0-6.25 2.707-6.25 6.25v16.668c0 3.332 2.707 6.25 6.25 6.25v8.332l8.332-8.332h6.25v-8.332c0-5.832 4.582-10.418 10.418-10.418h10.418v-4.168c-0.003907-3.543-2.7109-6.25-6.2539-6.25z" />
                </g>
              </svg>
            </div>
          )}
        </div>
        <form
          className="flex items-center space-x-2 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!generateEmbedding) {
              throw new Error('Unable to generate embeddings');
            }

            const output = await generateEmbedding(input, {
              pooling: 'mean',
              normalize: true,
            });

            const embedding = JSON.stringify(Array.from(output.data));

            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (!session) {
              return;
            }

            handleSubmit(e, {
              options: {
                headers: {
                  authorization: `Bearer ${session.access_token}`,
                },
                body: {
                  embedding,
                },
              },
            });
          }}
        >
          <Input
            type="text"
            autoFocus
            placeholder="Send a message"
            value={input}
            onChange={handleInputChange}
          />
          <Button type="submit" disabled={!isReady}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
