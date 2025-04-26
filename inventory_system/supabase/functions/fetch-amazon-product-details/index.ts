import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Define CORS headers - adjust origins as needed for security
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow all origins (adjust for production)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log(`Function "fetch-amazon-product-details" up and running!`);

const FNSKU_API_ENDPOINT = 'https://ato.fnskutoasin.com/api/v1/ScanTask/GetMyByBarCode';

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const fnsku = body.fnsku; // Assuming fnsku is passed in the request body

    if (!fnsku) {
      return new Response(
        JSON.stringify({ success: false, error: 'FNSKU parameter is required in the request body.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Retrieve the secure API key from Supabase environment variables
    const apiKey = Deno.env.get('FNSKU_TO_ASIN_API_KEY');
    if (!apiKey) {
      console.error('FNSKU_TO_ASIN_API_KEY not found in environment variables.');
      return new Response(
        JSON.stringify({ success: false, error: 'API Key not configured in Supabase environment variables.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiUrl = `${FNSKU_API_ENDPOINT}?BarCode=${encodeURIComponent(fnsku)}`;

    console.log(`Calling FNSKU API: ${apiUrl}`);

    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api-key': apiKey,
      },
    });

    console.log(`FNSKU API Status: ${res.status}`);

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`FNSKU API Error: ${res.status} - ${errorBody}`);
      return new Response(
        JSON.stringify({ 
            success: false, 
            error: `External FNSKU API request failed with status ${res.status}` 
        }),
        { status: res.status > 0 ? res.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } } 
      );
    }

    const result = await res.json();
    console.log('FNSKU API Raw Response:', JSON.stringify(result, null, 2));

    if (result && result.succeeded === true && result.data) {
        const productData = result.data;
        const responseData = {
          success: true,
          fnsku: productData.barCode,
          asin: productData.asin,
          // Add other relevant fields from productData if needed
          _apiResponse: productData 
        };

        return new Response(
          JSON.stringify(responseData),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } else {
      const errorMessage = result?.messages?.join(', ') || 'API did not return successful data or expected format';
      console.error('FNSKU API reported failure or unexpected data:', errorMessage);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `FNSKU ${fnsku} not found or API failed: ${errorMessage}` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } } 
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Internal function error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: `Internal server error: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}); 