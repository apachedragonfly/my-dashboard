import type { APIRoute } from 'astro';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto-js';

interface Book {
  title: string;
  progress: number;
  pages: number;
  current: boolean;
}

export const GET: APIRoute = async () => {
  const { GOODREADS_KEY, GOODREADS_SECRET, GOODREADS_USER_ID } = import.meta.env;

  // Fallback if no API credentials
  if (!GOODREADS_KEY || !GOODREADS_SECRET || !GOODREADS_USER_ID) {
    return new Response(
      JSON.stringify({ 
        error: true, 
        message: 'Goodreads credentials not configured',
        book: null 
      }),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800'
        }
      }
    );
  }

  try {
    const oauth = new OAuth({
      consumer: { key: GOODREADS_KEY, secret: GOODREADS_SECRET },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.HmacSHA1(base_string, key).toString(crypto.enc.Base64);
      },
    });

    const requestData = {
      url: `https://www.goodreads.com/review/list/${GOODREADS_USER_ID}.xml`,
      method: 'GET' as const,
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData));

    const response = await fetch(requestData.url, {
      method: 'GET',
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Goodreads API error: ${response.status}`);
    }

    const xmlText = await response.text();
    
    // Simple XML parsing for currently-reading books
    // In production, you'd want a proper XML parser
    const currentlyReadingMatch = xmlText.match(/<shelf name="currently-reading"[\s\S]*?<\/review>/);
    
    if (!currentlyReadingMatch) {
      return new Response(
        JSON.stringify({ 
          error: false,
          book: null,
          message: 'No currently reading book'
        }),
        { 
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800'
          }
        }
      );
    }

    const titleMatch = currentlyReadingMatch[0].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const pagesMatch = currentlyReadingMatch[0].match(/<num_pages>(.*?)<\/num_pages>/);
    
    const title = titleMatch ? titleMatch[1] : 'Unknown Book';
    const pages = pagesMatch ? parseInt(pagesMatch[1]) : 0;
    
    // Goodreads doesn't provide progress directly, so we'll use a placeholder
    // In a real implementation, you might track this separately
    const progress = 0;

    const book: Book = {
      title,
      progress,
      pages,
      current: true,
    };

    return new Response(JSON.stringify({ error: false, book }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800'
      },
    });
  } catch (error) {
    console.error('Goodreads API error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: true, 
        message: error instanceof Error ? error.message : 'Unknown error',
        book: null 
      }),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
        }
      }
    );
  }
};

