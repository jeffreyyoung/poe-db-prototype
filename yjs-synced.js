import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.24/+esm';
import Ably from 'https://esm.sh/ably';

// Create a Yjs document
const ydoc = new Y.Doc();

// Custom Ably provider for Yjs
class AblyProvider {
  constructor(ablyKey, roomName, ydoc) {
    this.ably = new Ably.Realtime(ablyKey);
    this.roomName = roomName;
    this.ydoc = ydoc;
    this.clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    this.channel = this.ably.channels.get(roomName);
    
    // Set up connection status logging
    this.ably.connection.once('connected', () => {
      console.log('Connected to Ably!');
    });
    
    // Subscribe to document updates
    this.channel.subscribe('update', (message) => {
      if (message.data.clientId === this.clientId) {
        return; // Ignore our own updates
      }
      
      // Apply the update to our document
      Y.applyUpdate(this.ydoc, message.data.update, 'remote');
    });
    
    // Subscribe to awareness updates
    this.channel.subscribe('awareness', (message) => {
      if (message.data.clientId === this.clientId) {
        return; // Ignore our own awareness updates
      }
      
      // Handle awareness updates if needed
      console.log('Received awareness update:', message.data);
    });
    
    // Subscribe to document state requests
    this.channel.subscribe('request', (message) => {
      if (message.data.clientId === this.clientId) {
        return; // Ignore our own requests
      }
      
      // Send our document state
      this.channel.publish('state', {
        clientId: this.clientId,
        state: Y.encodeStateAsUpdate(this.ydoc)
      });
    });
    
    // Subscribe to document state responses
    this.channel.subscribe('state', (message) => {
      if (message.data.clientId === this.clientId) {
        return; // Ignore our own state
      }
      
      // Apply the received state
      Y.applyUpdate(this.ydoc, message.data.state, 'remote');
    });
    
    // Set up document update handler
    this.ydoc.on('update', (update, origin) => {
      if (origin !== 'remote') {
        // Broadcast our update to other clients
        this.channel.publish('update', {
          clientId: this.clientId,
          update: update
        });
      }
    });
    
    // Request initial document state
    this.channel.publish('request', {
      clientId: this.clientId
    });
    
    // Announce our presence
    this.channel.publish('joined', {
      clientId: this.clientId
    });
  }
  
  // Method to disconnect
  disconnect() {
    this.channel.publish('left', {
      clientId: this.clientId
    });
    this.ably.close();
  }
}

// Create an instance of the Ably provider
// Replace 'YOUR_ABLY_API_KEY' with your actual Ably API key
const ablyProvider = new AblyProvider('"frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM"', 'poe-db-prototype', ydoc);

// Export both the document and the provider
export { ydoc, ablyProvider };
