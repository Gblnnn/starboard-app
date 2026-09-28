import fs from 'fs';

async function main() {
  try {
    let supabaseUrl = 'https://layonfapjyiupkjdswbj.supabase.co/';
    let supabaseKey = 'sb_publishable_60EgFkAFmczfEjOySTOBQQ_QYKGosa_';
    
    // Check company_master
    const url = `${supabaseUrl}/rest/v1/company_master?select=alfa_code,company_name`;
    console.log("Fetching from:", url);
    
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    const data = await response.json();
    console.log("Data:", data);
  } catch(e) {
    console.error(e);
  }
}

main();
