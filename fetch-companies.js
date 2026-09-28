async function run() {
    let supabaseUrl = 'https://layonfapjyiupkjdswbj.supabase.co';
    let supabaseKey = 'sb_publishable_60EgFkAFmczfEjOySTOBQQ_QYKGosa_';
    
    // Check employees
    const url = `${supabaseUrl}/rest/v1/employees?select=*&limit=1`;
    console.log("Fetching from:", url);
    
    const response = await fetch(url, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    
    const data = await response.json();
    console.log("Data:", data);
}

run();
