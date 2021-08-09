/********************
 * WEBSOCKET HELPERS
 ********************/

class WSHelper {
  constructor(host, port, endpoint, reconnect_delay = 5000) {
    this.ws = null;
    this.ws_uri = "ws://" + host + ":" + port + "/" + endpoint;
    this.attempting_connection = false;
    this.connectInterval = null;
    this.connect_period = reconnect_delay;
    this.userHandleMessage = (evt) => {};
    this.statusCallback = (status) => {};
  }

  connect() {
    if (this.ws !== null) {
      if (this.ws.readyState === WebSocket.OPEN) return true;
    }

    this.ws = new WebSocket(this.ws_uri);
    this.ws.onmessage = (evt) => this.userHandleMessage(evt);
    this.ws.onopen = (evt) => this.handleOpen(evt);
    this.ws.onclose = (evt) => this.attemptConnection();
    // ws.onerror = (evt) => this.updateSocketStatus();
    this.ws.addEventListener('error', (evt) => { this.statusCallback(this.status()); });

    return this.ws.readyState === WebSocket.OPEN;
  }

  attemptConnection() {
    // If we aren't already trying to connect, try now.
    if (!this.attempting_connection) {
      // Try to connect. If we fail, start an interval to keep trying.
      if (!this.connect()) {
        this.connectInterval = setInterval(() => {
          this.connect();
        }, this.connect_period);

        this.attempting_connection = true;
      }
    }

    this.statusCallback(this.status());
  }

  handleOpen(evt) {
    console.log("WebSocket connection open to:", this.ws_uri);

    if (this.connectInterval !== null) {
      clearInterval(this.connectInterval);
    }
    this.attempting_connection = false;

    this.statusCallback(this.status());
  }

  status() {
    if (this.ws === null) return WebSocket.CLOSED;
    return this.ws.readyState;
  }

  send(data) {
    if (this.status() !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(data));
  }
}

export { WSHelper };
