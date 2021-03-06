module.exports = function (RED) {
  "use strict"
  var twilio = require('twilio')

  function twilioRequest(from, to, text) {
    return {
      from: from,
      to: to,
      body: text
    }
  }

  function twilioResponse(node, msg, err, message) {
    node.sent++;
    node.internalSent++;
    if (err) {
      node.failed++;
      node.failedMessages.push(err)
    } else {
      if (message.from && message.from.indexOf('1500555000') >= 0) {
        message.sid += '-TEST'
      }
      node.delivered++;
      node.log(message.sid + ' | ' + message.to + ' | ' + message.body)
      node.sentMessages.push({
        sid: message.sid,
        to: message.to,
        body: message.body
      })
    }
    if (node.buffer.length === 0) {
      if(node.bufferLength === (node.internalSent)) {
        node.internalSent = 0
        msg.payload = {
          sent : node.sentMessages,
          failed : node.failedMessages
        }
        node.send(msg)
      }
      node.status({
        fill: "yellow",
        shape: "dot",
        text: node.sent + ', success: ' + node.delivered + ', error: ' + node.failed
      })
    }
  }

  function getMsgProps(msg, props) {
    return props.split(".").reduce(function (obj, i) {
      return obj[i]
    }, msg)
  }

  function makeNumberMessagePairs(node, msg) {
    var message = node.message;
    var numbers = node.numbers;
    if (!message) {
      message = getMsgProps(msg, 'payload')
    }
    if (!numbers) {
      numbers = getMsgProps(msg, 'topic').split(",")
    } else {
      numbers = numbers.split(",")
    }
    return numbers.map(function (elem) {
      return {
        to: elem,
        text: message
      }
    })
  }

  function twilioSMS(node, to, text, msg) {
    if (node.twilioClient && node.twilio.credentials.from) {
      node.twilioClient.messages.create(twilioRequest(node.twilio.credentials.from, to, text), twilioResponse.bind(undefined, node, msg))
    } else {
      twilioResponse(node, msg, null, {
        'sid': 'SIMULATED',
        'to': to,
        'body': text
      })
    }
  }

  function throtlleSMS(node, msg) {
    Array.prototype.push.apply(node.buffer, makeNumberMessagePairs(node, msg))
      // if timer already running there is nothing to do
    node.bufferLength = node.buffer.length
    node.sentMessages = []
    node.failedMessages = []
    if (node.intervalID !== -1) {
      return;
    }
    node.intervalID = setInterval(function () {
      if (node.buffer.length === 0) {
        clearInterval(node.intervalID)
        node.intervalID = -1
      } else {
        var elem = node.buffer.shift();
        twilioSMS(node, elem.to, elem.text, msg);
        if (node.buffer.length > 0) {
          node.status({
            text: node.buffer.length + ' pending',
            fill: 'grey',
            shape: 'dot'
          })
        }
      }
    }, node.throttle)
  }

  function SmsNode(config) {
    RED.nodes.createNode(this, config)
    var node = this
    this.delivered = 0
    this.failed = 0
    this.sent = 0
    this.internalSent = 0
    this.sentMessages = []
    this.failedMessages = []
    this.twilio = RED.nodes.getNode(config.twilio)
    if (this.twilio) {
      node.status({
        shape: "ring",
        fill: "blue",
        text: this.twilio.name
      })
      this.twilioClient = twilio(this.twilio.credentials.sid, this.twilio.credentials.token)
    } else {
      node.status({
        shape: "ring",
        fill: "red",
        text: "SIMULATED"
      })
    }
    this.message = config.message
    this.numbers = config.numbers
    this.throttle = config.throttle || 0
    this.buffer = [];
    this.bufferLength = 0
    this.intervalID = -1;
    this.on("input", throtlleSMS.bind(undefined, this))
    this.on("close", function () {
      clearInterval(this.intervalID)
      this.buffer = []
      this.bufferLength = 0
      this.sentMessages = []
      this.failedMessages = []
    })
  }

  function TwilioConfigNode(config) {
    RED.nodes.createNode(this, config)
    this.name = config.name
  }

  RED.nodes.registerType("sms", SmsNode)
  RED.nodes.registerType("twilioConfig", TwilioConfigNode, {
    credentials: {
      sid: {
        type: "text"
      },
      token: {
        type: "text"
      },
      from: {
        type: "text"
      }
    }
  })

}