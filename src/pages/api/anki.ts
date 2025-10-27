import type { APIRoute } from 'astro';

interface AnkiResponse {
  today: number;
  error?: boolean;
  message?: string;
}

export const GET: APIRoute = async () => {
  const ankiHost = import.meta.env.ANKI_CONNECT_HOST || 'http://localhost:8765';

  try {
    const response = await fetch(ankiHost, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getNumCardsReviewedToday',
        version: 6,
      }),
    });

    if (!response.ok) {
      throw new Error('AnkiConnect is offline or unreachable');
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    const result: AnkiResponse = {
      today: data.result || 0,
      error: false,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      },
    });
  } catch (error) {
    console.error('AnkiConnect error:', error);

    const result: AnkiResponse = {
      today: 0,
      error: true,
      message: error instanceof Error ? error.message : 'AnkiConnect offline',
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      },
    });
  }
};

