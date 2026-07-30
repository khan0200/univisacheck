const fs = require('fs');

try {
    const html = fs.readFileSync('index.html', 'utf8');
    // Extract TOP_UNIS_DATA array using regex or string splitting
    const startIndex = html.indexOf('let TOP_UNIS_DATA = [');
    if (startIndex === -1) throw new Error("Could not find TOP_UNIS_DATA in index.html");
    
    // Find the end of the array. It ends with "];" before "const bothBadgesList" or similar.
    let endIndex = html.indexOf('];', startIndex);
    
    // Some parsing to safely extract the JS object.
    // Since it's raw JS inside HTML, we can use a new Function to evaluate it.
    let arrayString = html.substring(startIndex + 'let TOP_UNIS_DATA = '.length, endIndex + 1);
    
    // The string contains JS objects with unquoted keys. We can evaluate it safely:
    const extractFunc = new Function(`return ${arrayString}`);
    const unisArray = extractFunc();
    
    const dbObj = {};
    for (const uni of unisArray) {
        if (!uni.name) continue;
        const key = uni.name.toUpperCase();
        dbObj[key] = uni;
    }
    
    fs.writeFileSync('universities-db.json', JSON.stringify(dbObj, null, 2));
    console.log(`Successfully synced ${unisArray.length} universities to universities-db.json!`);
} catch (e) {
    console.error("Error syncing DB:", e);
}
