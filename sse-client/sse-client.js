const EventSource = require("eventsource")

function updateStatus(node){
  node.status({
    fill: 'green',
    shape: 'dot',
    text: 'active clients: ' + Object.keys(node.eventSources).length
  });
}

/**
 * Handles an event by logging it and sending a message to the node with a generated ID, topic, and payload.
 *
 * @param {Object} RED - the global RED object
 * @param {Object} node - the node object that received the event
 * @param {Object} event - the event object received
 * @return {void}
 */
function handleEvent(RED, node, event, eventSource, uuid) {
  RED.log.debug(`Received event: from ${this.url} - ${event.type}`);

  var data;
  try {
    data = node.output == 'json' ? JSON.parse(event.data) : event.data;
  } catch (error) {
    data = event.data;
  }

  node.send({
    _msid: RED.util.generateId(),
    topic: event.type,
    payload: {uuid, data, event: 'message'}
  });
}

/**
 * Handles errors from an event source.
 *
 * @param {Object} RED - the Node-RED runtime object
 * @param {Object} node - the node that received the error
 * @param {Error} err - the error that occurred
 * @return {void}
 */
function handleEventSourceError(RED, node, err, eventSource, uuid) {
  
  eventSource.close();
  delete node.eventSources[uuid];

  updateStatus(node);

  node.send({
    _msid: RED.util.generateId(),
    payload: {uuid, event: 'close'}
  });
  
}

/**
 * Closes the eventSource and logs a debug message.
 *
 * @param {Object} RED - The Node-RED runtime object.
 * @param {Object} node - The node instance that the function is called on.
 * @return {void}
 */
function handleEventSourceClose(RED, node) {
  RED.log.debug(`Closing event source: ${this.url}`);
  node.eventSource.close()
}

module.exports = function (RED) {

  /**
   * Creates a new SSE (Server-Sent Events) client node.
   *
   * @param {Object} config - Node-RED node configuration object.
   */
  function CreateSseClientNode(config) {
    try {
      RED.nodes.createNode(this, config);

      this.event = config.event;
      this.output = config.output;
      this.headers = config.headers ? JSON.parse(config.headers) : {};
      this.eventSources = {};

      const node = this;

      this.on('input', (msg, send, done) => {
        try {
          const url = msg.payload.url;
          const uuid = msg.payload.uuid;

          if(node.eventSources[uuid]){
            node.error("Duplicate uuid refused: " + uuid);
            return;
          }

          const headers = msg.payload.headers || node.headers;
          const eventSource = new EventSource(url, { withCredentials: true, headers: headers });

          // Register default message event
          eventSource.on(this.event, (event) => handleEvent(RED, node, event, eventSource, uuid))

          // Register error event
          eventSource.on('error', (err) => handleEventSourceError(RED, node, err, eventSource, uuid));

          node.eventSources[uuid]= eventSource;

          updateStatus(node);

        } catch (error) {
          RED.log.error(error)
          updateNodeStatus(this, 'error');
        } finally {
          if (done && typeof done === 'function') done()
        }
      });

      updateStatus(node);

      // // Register close event of the node runtime to clean up old event sources
      // this.on('close', () => handleEventSourceClose(RED, this));
    } catch (error) {
      this.status({
        fill: 'red',
        shape: 'dot',
        text: `${error.message}`
      })
      console.error(error)
      RED.log.error(error)
    }

  }
  RED.nodes.registerType('sse-client', CreateSseClientNode);
};