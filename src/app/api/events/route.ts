import { ensureRealtimeSubscription, onRealtimeMessage } from "@/lib/realtime";

export const runtime = "nodejs";

function toSse(data: string) {
  return `data: ${data}\n\n`;
}

export async function GET(request: Request) {
  await ensureRealtimeSubscription();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pingInterval = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
      }, 15000);

      const unsubscribe = onRealtimeMessage((message) => {
        controller.enqueue(encoder.encode(toSse(message)));
      });

      controller.enqueue(
        encoder.encode(
          toSse(
            JSON.stringify({
              type: "connected",
              at: new Date().toISOString(),
            }),
          ),
        ),
      );

      const close = () => {
        clearInterval(pingInterval);
        unsubscribe();
      };

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      // noop: listener cleanup handled on abort.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
