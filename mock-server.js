/**
 * Mock server for Repli-Cache
 * This simulates the backend API endpoints for pull and push operations
 */

// In-memory data store
let serverData = {
  todos: []
};

// Version tracking
let serverVersion = 0;

// Create a simple HTTP server
const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  
  // Handle pull requests
  if (parsedUrl.pathname === '/pull' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        console.log('Pull request from client:', requestData.clientID);
        
        // Return the current server data and version
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          version: serverVersion,
          data: serverData
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }
  
  // Handle push requests
  else if (parsedUrl.pathname === '/push' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        console.log('Push request from client:', requestData.clientID);
        
        // Update server data with the pushed data
        serverData = { ...serverData, ...requestData.data };
        serverVersion++;
        
        // Return success with the new version
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          version: serverVersion,
          success: true
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
  }
  
  // Handle unknown routes
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mock server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  - POST /pull  - Pull data from the server');
  console.log('  - POST /push  - Push data to the server');
}); 