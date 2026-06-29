import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const customReadable = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: {"type": "ping", "time": ${Date.now()}}\n\n`));
      
      // Setup interval for pings/updates
      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(`data: {"type": "ping", "time": ${Date.now()}}\n\n`));
      }, 30000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new NextResponse(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
