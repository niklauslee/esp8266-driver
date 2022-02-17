var EventEmitter = require("events").EventEmitter;

var MOCK_IP = "192.168.0.15";
var MOCK_MAC = "ec:fa:bc:25:98:02";
var MOCK_RESPONSE = {
  "AT+RST": ["OK", "...", "2nd boot version : 1.5", "...", "ready"],
  "AT+CWMODE=1": ["", "OK"],
  "AT+CIPMUX=1": ["", "OK"],
  "AT+CWJAP?": ["No AP", "", "OK"],
  "AT+CWJAP=": (cmd, mock) => {
    mock._tx(["WIFI CONNECTED"], 300);
    mock._tx(["WIFI GOT IP"], 600);
    mock._tx(["", "OK"], 1000);
  },
  "AT+CIFSR": [
    `+CIFSR:STAIP,"${MOCK_IP}"`,
    `+CIFSR:STAMAC,"${MOCK_MAC}"`,
    "",
    "OK",
  ],
  "AT+CWQAP": ["", "OK", "WIFI DISCONNECT"],
  "AT+CWLAP": [
    '+CWLAP:(3,"niklaus",-49,"90:9f:33:d3:04:be",11,-2,0)',
    '+CWLAP:(4,"SK_WiFiGIGA9104",-51,"00:23:aa:c1:91:06",3,18,0)',
    "",
    "OK",
  ],
  "AT+CIPSEND=": (cmd, mock) => {
    mock._tx(["", "OK", "> "]);
    var tks = cmd.split("=")[1].split(",");
    mock._conn = parseInt(tks[0]);
    mock._len = parseInt(tks[1]);
    mock._mode = "data"; // change to 'data' mode
  },
  "AT+CIPSTART=0,": ["0,CONNECT", "", "OK"],
  "AT+CIPCLOSE=": ["", "OK"],
  "AT+CIPSERVER=1": ["", "OK"],
  "AT+CIPSERVER=0": ["", "OK"],
};

class ESP8266Mock extends EventEmitter {
  constructor() {
    super();
    this._mode = "cmd"; // 'cmd' or 'data'
    this._len = 0; // length of data to receive in 'data' mode.
    this._databuf = ""; // buffer for data in 'data' mode.
    this._ip = MOCK_IP;
    this._mac = MOCK_MAC;
    this._encoder = new TextEncoder("ascii");
    this._rxbuf = [];
    this._txbuf = [];
  }

  /**
   * Send data to ESP8266's TX pin
   * @param {string|Array<string>} data
   * @param {number} delay
   */
  _tx(data, delay = 100, cb = null) {
    if (Array.isArray(data)) {
      data = data.join("\r\n") + "\r\n";
    }
    setTimeout(() => {
      this._txbuf.push(data);
      this.emit("data", this._encoder.encode(data));
      if (cb) cb();
    }, delay);
  }

  _reply(cmd) {
    Object.keys(MOCK_RESPONSE).forEach((match) => {
      if (cmd.startsWith(match)) {
        var r = MOCK_RESPONSE[match];
        if (typeof r === "function") {
          r = r(cmd, this);
        } else {
          this._tx(r);
        }
      }
    });
  }

  /**
   * Receives data from ESP8266's RX pin. It simulates uart.write() method.
   * @param {Uint8Array|string} data
   */
  write(data) {
    if (this._mode === "cmd") {
      // 'cmd' mode
      this._rxbuf.push(data);
      this._tx(data, 0); // echo
      this._reply(data);
    } else {
      // 'data' mode
      this._databuf += data;
      if (this._databuf.length >= this._len) {
        this._rxbuf.push(this._databuf);
        this._tx(
          [`Recv ${this._databuf.length} bytes`, "", "SEND OK"],
          0,
          () => {
            this._mode = "cmd";
            this._databuf = "";
            this._len = 0;
          }
        );
      }
    }
  }

  /**
   * Close UART mock
   */
  close() {
    // Nothing to do
  }
}

exports.ESP8266Mock = ESP8266Mock;
