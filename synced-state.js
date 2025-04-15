let globals = {
    state: null,
    actions: null,
    onChange: null,
    ably: null,
    channel: null,
    clientId: null
  }
  
  export const setup = ({ initialState, actions, onChange, channelName = "get-started" }) => {
    globals.state = initialState;
    globals.actions = actions;
    globals.onChange = onChange;
    
    // Generate a unique client ID
    globals.clientId = 'client_' + Math.random().toString(36).substring(2, 15);
    
    // Method 2: Using createScript with promises
    function loadScript(url) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = url;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
      });
    }

    // Load the Ably library and initialize
    loadScript("https://cdn.ably.io/lib/ably.min-1.js")
      .then(() => {
        console.log("Ably loaded:", window.Ably);
        
        // Connect to Ably
        globals.ably = new window.Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");
        
        // Create a channel
        globals.channel = globals.ably.channels.get(channelName);
        
        // Setup connection event handler
        globals.ably.connection.once("connected", () => {
          console.log("Connected to Ably!");
          
          // Request initial state from other clients
          globals.channel.publish("get-initial-state", {
            sourceClientId: globals.clientId,
            timestamp: Date.now()
          });
        });
        
        // Subscribe to state update messages
        globals.channel.subscribe("state-update", (message) => {
          // Ignore messages from this client
          if (message.data.sourceClientId === globals.clientId) {
            console.log("Ignoring own state update");
            return;
          }
          
          // Update state when receiving messages from other clients
          globals.state = {...globals.state, ...message.data.state};
          globals.onChange(globals.state);
        });
        
        // Subscribe to get-initial-state requests
        globals.channel.subscribe("get-initial-state", (message) => {
          // Ignore requests from this client
          if (message.data.sourceClientId === globals.clientId) {
            return;
          }
          
          console.log("Received state request from another client, sending current state");
          
          // Respond with current state
          globals.channel.publish("state-update", {
            sourceClientId: globals.clientId,
            state: globals.state,
            isInitialState: true,
            respondingTo: message.data.sourceClientId
          });
        });
      })
      .catch(error => console.error("Failed to load Ably:", error));
  }
  
  export const action = (actionName, payload) => {
    if (!globals.actions[actionName]) {
      throw new Error("Action not defined: "+actionName)
    }
    
    // Execute local action
    globals.actions[actionName](payload, globals.state);
    
    // Publish state update to Ably
    if (globals.channel) {
      globals.channel.publish("state-update", {
        sourceClientId: globals.clientId,
        state: globals.state
      });
    }
    
    // Update UI
    globals.onChange(globals.state);
  }
  
  export const publishMessage = (eventName, data) => {
    if (globals.channel) {
      globals.channel.publish(eventName, {
        sourceClientId: globals.clientId,
        data: data
      });
      console.log("Message published:", eventName, data);
    }
  }
  
  export const closeConnection = () => {
    if (globals.ably) {
      globals.ably.connection.close();
      globals.ably.connection.once("closed", () => {
        console.log("Closed the connection to Ably.");
      });
    }
  }
  
  
